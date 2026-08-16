'use strict';

const express = require('express');
const guildManager = require('../../../../core/guild/guildManager');
const roleSelector = require('../../../../modules/roleStudio/roleSelector/roleSelector');
const healthService = require('../../../../modules/roleStudio/roleSelector/roleSelectorHealth');

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
function failure(res, error, status = 400) { return res.status(status).json({ success: false, error: error.message || 'Role Selector request failed.' }); }

async function overview(req, id) {
  const g = await guild(req, id);
  return {
    guildId: id,
    enabled: guildManager.isModuleEnabled(id, roleSelector.MODULE),
    config: roleSelector.getSection(id),
    groups: roleSelector.listGroups(id),
    styleSuggestion: g ? roleSelector.suggestRoleStyle(g) : null,
    usage: g ? await roleSelector.getUsage(g) : { groups: [], totalUsing: 0, totalMembers: 0 },
    health: g ? await healthService.buildHealth(g) : null,
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try { return success(res, await overview(req, guildId(req))); } catch (error) { return failure(res, error); }
});

router.put('/:guildId/config', async (req, res) => {
  try {
    const id = guildId(req); const patch = req.body || {};
    if (typeof patch.enabled === 'boolean') guildManager.setModuleEnabled(id, roleSelector.MODULE, patch.enabled, { actorId: actorId(req), action: 'role_selector_dashboard_toggle' });
    roleSelector.updateSection(id, (current) => ({
      ...current,
      ...(patch.style ? { style: { ...current.style, ...patch.style } } : {}),
      ...(patch.deployment ? { deployment: { ...current.deployment, ...patch.deployment } } : {}),
      ...(patch.cleanup ? { cleanup: { ...current.cleanup, ...patch.cleanup } } : {}),
    }), { actorId: actorId(req), action: 'role_selector_dashboard_config' });
    const g = await guild(req, id);
    if (g) {
      await roleSelector.syncManagedRoleAppearance(g).catch(() => null);
      await roleSelector.syncManagedRoleHierarchy(g).catch(() => null);
    }
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/groups', async (req, res) => {
  try {
    const id = guildId(req); const body = req.body || {};
    if (body.id === roleSelector.COLOUR_GROUP_ID || body.type === 'colour') throw new Error('Use the Colours settings endpoint for the built-in Colours selector.');
    const group = roleSelector.saveGroup(id, {
      ...body,
      selectionMode: body.selectionMode === 'multiple' ? 'multiple' : 'single',
      allowRemove: body.allowRemove !== false,
      builtIn: false,
      type: 'standard',
    }, { actorId: actorId(req), action: 'role_selector_dashboard_save_group' });
    return success(res, { group, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.delete('/:guildId/groups/:groupId', async (req, res) => {
  try {
    const id = guildId(req); roleSelector.removeGroup(id, req.params.groupId, { actorId: actorId(req), action: 'role_selector_dashboard_delete_group' });
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.put('/:guildId/colours', async (req, res) => {
  try {
    const id = guildId(req); const current = roleSelector.getGroup(id, roleSelector.COLOUR_GROUP_ID); const patch = req.body || {};
    roleSelector.saveGroup(id, {
      ...current,
      ...(Array.isArray(patch.palette) ? { palette: patch.palette } : {}),
      ...(patch.customHexEnabled === undefined ? {} : { customHexEnabled: patch.customHexEnabled === true }),
      ...(patch.allowRemove === undefined ? {} : { allowRemove: patch.allowRemove !== false }),
    }, { actorId: actorId(req), action: 'role_selector_dashboard_colours' });
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/scan-style', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.');
    const suggestion = roleSelector.suggestRoleStyle(g);
    roleSelector.updateSection(id, (current) => ({ ...current, style: { ...current.style, detectedFormat: suggestion.format, detectedIcon: suggestion.icon, detectedSeparator: suggestion.separator, detectedConfidence: suggestion.confidence } }), { actorId: actorId(req), action: 'role_selector_dashboard_style_scan' });
    return success(res, { suggestion, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/apply-style', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.');
    roleSelector.updateSection(id, (current) => ({ ...current, style: { ...current.style, format: current.style.detectedFormat || current.style.format, icon: current.style.detectedIcon || '', separator: current.style.detectedSeparator || current.style.separator } }), { actorId: actorId(req), action: 'role_selector_dashboard_style_apply' });
    await roleSelector.syncManagedRoleAppearance(g); await roleSelector.syncManagedRoleHierarchy(g);
    return success(res, await overview(req, id));
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/deploy', async (req, res) => {
  try {
    const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.');
    const channelId = String(req.body?.channelId || roleSelector.getSection(id).deployment?.channelId || '').trim(); if (!channelId) throw new Error('Select a deployment channel.');
    const channel = g.channels.cache.get(channelId) || await g.channels.fetch(channelId).catch(() => null); if (!channel?.send) throw new Error('Selected channel is unavailable.');
    const panel = require('../../../../modules/roleStudio/roleSelector/roleSelectorPanel');
    const section = roleSelector.getSection(id); let message = section.deployment?.messageId ? await channel.messages.fetch(section.deployment.messageId).catch(() => null) : null; const payload = panel.memberLauncherPayload(g);
    if (message) await message.edit(payload); else message = await channel.send(payload);
    roleSelector.updateSection(id, (current) => ({ ...current, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: actorId(req), action: 'role_selector_dashboard_deploy' });
    return success(res, { messageId: message.id, ...(await overview(req, id)) });
  } catch (error) { return failure(res, error); }
});

router.post('/:guildId/repair', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.'); const repair = await healthService.repair(g); return success(res, { repair, ...(await overview(req, id)) }); } catch (error) { return failure(res, error); }
});
router.post('/:guildId/cleanup', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.'); const cleanup = await roleSelector.cleanupUnused(g); return success(res, { cleanup, ...(await overview(req, id)) }); } catch (error) { return failure(res, error); }
});
router.get('/:guildId/usage', async (req, res) => {
  try { const id = guildId(req); const g = await guild(req, id); if (!g) throw new Error('Guild is unavailable.'); return success(res, { usage: await roleSelector.getUsage(g) }); } catch (error) { return failure(res, error); }
});

module.exports = router;
