'use strict';

const express = require('express');
const guildManager = require('../../../../core/guild/guildManager');
const colourRoles = require('../../../../modules/roleStudio/colourRoles/colourRoles');
const healthService = require('../../../../modules/roleStudio/colourRoles/colourRolesHealth');
const colourRolesPanel = require('../../../../modules/roleStudio/colourRoles/colourRolesPanel');

const router = express.Router();

function guildId(req) {
  const value = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(value)) throw new Error('Invalid guild ID.');
  return value;
}
function actorId(req) { return String(req.session?.user?.id || req.body?.actorId || '').trim() || null; }
function client(req) { return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || null; }
async function guild(req, id) { const c = client(req); return c?.guilds?.cache?.get(id) || await c?.guilds?.fetch?.(id).catch(() => null); }
function success(res, payload = {}) { return res.json({ success: true, ...payload }); }
function failure(res, error, status = 400) { return res.status(status).json({ success: false, error: error.message || 'Colour Roles request failed.' }); }

async function overview(req, id) {
  const g = await guild(req, id);
  const config = colourRoles.getSection(id);
  return {
    guildId: id,
    enabled: guildManager.isModuleEnabled(id, colourRoles.MODULE),
    config,
    styleSuggestion: g ? colourRoles.suggestRoleStyle(g) : null,
    usage: g ? await colourRoles.getUsage(g) : { rows: [], totalUsing: 0, totalMembers: 0 },
    health: g ? await healthService.buildHealth(g) : null,
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try { return success(res, await overview(req, guildId(req))); } catch (error) { return failure(res, error); }
});

router.put('/:guildId/config', async (req, res) => {
  try {
    const id = guildId(req);
    const patch = req.body || {};
    if (typeof patch.enabled === 'boolean') guildManager.setModuleEnabled(id, colourRoles.MODULE, patch.enabled, { actorId: actorId(req) });
    const current = colourRoles.getSection(id);
    const next = colourRoles.updateSection(id, {
      ...current,
      ...(patch.customHexEnabled === undefined ? {} : { customHexEnabled: patch.customHexEnabled === true }),
      ...(patch.allowRemoveColour === undefined ? {} : { allowRemoveColour: patch.allowRemoveColour !== false }),
      ...(patch.palette ? { palette: patch.palette } : {}),
      ...(patch.style ? { style: { ...current.style, ...patch.style } } : {}),
      ...(patch.deployment ? { deployment: { ...current.deployment, ...patch.deployment } } : {}),
      ...(patch.cleanup ? { cleanup: { ...current.cleanup, ...patch.cleanup } } : {}),
    }, { actorId: actorId(req), action: 'colour_roles_dashboard_config' });
    const g = await guild(req, id);
    if (g && next.style.anchorRoleId && next.style.keepGrouped) await colourRoles.reorderManagedRoles(g);
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/scan-style', async (req, res) => {
  try {
    const id = guildId(req);
    const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    const suggestion = colourRoles.suggestRoleStyle(g);
    const current = colourRoles.getSection(id);
    colourRoles.updateSection(id, {
      ...current,
      style: {
        ...current.style,
        detectedFormat: suggestion.format,
        detectedIcon: suggestion.icon,
        detectedSeparator: suggestion.separator,
        detectedConfidence: suggestion.confidence,
      },
    }, { actorId: actorId(req), action: 'colour_roles_style_scan' });
    return success(res, { suggestion, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/apply-style-suggestion', async (req, res) => {
  try {
    const id = guildId(req);
    const current = colourRoles.getSection(id);
    if (!current.style.detectedFormat) throw new Error('Run the guild style scan first.');
    const next = colourRoles.updateSection(id, {
      ...current,
      style: {
        ...current.style,
        format: current.style.detectedFormat,
        icon: current.style.detectedIcon || '',
        separator: current.style.detectedSeparator || '|',
      },
    }, { actorId: actorId(req), action: 'colour_roles_style_suggestion_applied' });
    const g = await guild(req, id);
    if (g && next.style.anchorRoleId && next.style.keepGrouped) await colourRoles.reorderManagedRoles(g);
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/create-divider', async (req, res) => {
  try {
    const id = guildId(req);
    const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    const name = String(req.body?.name || '🌈 | COLOUR ROLES').trim().slice(0, 100);
    const divider = await g.roles.create({
      name,
      color: 0,
      hoist: false,
      mentionable: false,
      permissions: [],
      reason: 'Goliath Colour Roles divider',
    });
    if (!colourRoles.canManageRole(g, divider)) {
      await divider.delete('Goliath Colour Roles divider could not be safely managed').catch(() => null);
      throw new Error('Goliath could not manage the new divider because of role hierarchy.');
    }
    const current = colourRoles.getSection(id);
    colourRoles.updateSection(id, {
      ...current,
      style: { ...current.style, anchorRoleId: divider.id },
    }, { actorId: actorId(req), action: 'colour_roles_dashboard_divider_created' });
    await colourRoles.reorderManagedRoles(g);
    return success(res, { divider: { id: divider.id, name: divider.name }, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/deploy', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    const config = colourRoles.getSection(id);
    const channelId = config.deployment?.channelId;
    if (!channelId) throw new Error('Select a Colour Roles deployment channel first.');
    const channel = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error('Colour Roles deployment channel is unavailable.');
    let message = null;
    if (config.deployment?.messageId) message = await channel.messages.fetch(config.deployment.messageId).catch(() => null);
    const payload = colourRolesPanel.buildMemberPayload(g);
    message = message ? await message.edit(payload) : await channel.send(payload);
    colourRoles.updateSection(id, (current) => ({ ...current, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: actorId(req), action: 'colour_roles_dashboard_deploy' });
    return success(res, { messageId: message.id, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/repair', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    const repair = await healthService.repair(g, { actorId: actorId(req) });
    return success(res, { repair, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/cleanup', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    const cleanup = await colourRoles.markAndCleanupUnused(g);
    return success(res, { cleanup, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.get('/:guildId/usage', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id);
    if (!g) throw new Error('Guild is unavailable.');
    return success(res, { usage: await colourRoles.getUsage(g) });
  } catch (error) { return failure(res, error); }
});

module.exports = router;
