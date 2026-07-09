'use strict';

const express = require('express');

const guildManager = require('../../core/guild/guildManager');
const verificationStore = require('../../modules/verification/verificationStore');
const verificationManager = require('../../modules/verification/verificationManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Verification API]', error);
  return res.status(status).json({ success: false, error: error.message || 'Verification API request failed.' });
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function getGuildId(req) {
  const guildId = cleanDiscordId(req.params.guildId || req.query?.guildId);
  if (!guildId) throw new Error('Invalid guild ID.');
  return guildId;
}

function getActorId(req) {
  return cleanDiscordId(req.session?.user?.id || req.body?.actorId || req.query?.actorId);
}

function getClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || global.client || null;
}

async function getGuild(req, guildId) {
  const client = getClient(req);
  if (!client?.guilds) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function getSendableChannel(req, guildId, channelId) {
  const guild = await getGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) throw new Error('Channel is unavailable or not sendable.');
  return channel;
}

function cleanRoleIds(value = []) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(cleanDiscordId).filter(Boolean))];
}

function getAdminConfig(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.verification && typeof modules.verification === 'object' ? modules.verification : {};
  return {
    enabled: true,
    verificationChannelId: null,
    logChannelId: null,
    verifiedRoleIds: [],
    pendingRoleIds: [],
    dmOnVerify: true,
    removePendingRole: true,
    ...config,
  };
}

function saveAdminConfig(guildId, input = {}, meta = {}) {
  const current = getAdminConfig(guildId);
  const next = {
    ...current,
    ...input,
    verificationChannelId: input.verificationChannelId === undefined ? current.verificationChannelId : cleanDiscordId(input.verificationChannelId),
    logChannelId: input.logChannelId === undefined ? current.logChannelId : cleanDiscordId(input.logChannelId),
    verifiedRoleIds: input.verifiedRoleIds === undefined ? current.verifiedRoleIds : cleanRoleIds(input.verifiedRoleIds),
    pendingRoleIds: input.pendingRoleIds === undefined ? current.pendingRoleIds : cleanRoleIds(input.pendingRoleIds),
    enabled: input.enabled === undefined ? current.enabled !== false : input.enabled === true,
    dmOnVerify: input.dmOnVerify === undefined ? current.dmOnVerify !== false : input.dmOnVerify === true,
    removePendingRole: input.removePendingRole === undefined ? current.removePendingRole !== false : input.removePendingRole === true,
    updatedAt: new Date().toISOString(),
  };

  guildManager.updateGuildSection(guildId, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    verification: next,
  }), {}, meta);

  verificationManager.configureVerification(guildId, {
    enabled: next.enabled !== false,
    settings: {
      verifiedRoleId: cleanRoleIds(next.verifiedRoleIds)[0] || null,
      unverifiedRoleId: cleanRoleIds(next.pendingRoleIds)[0] || null,
      logChannelId: next.logChannelId || null,
      dmOnVerify: next.dmOnVerify !== false,
      removePendingRole: next.removePendingRole !== false,
    },
  }, meta);

  return getAdminConfig(guildId);
}

function buildExport(guildId) {
  return {
    exportedAt: new Date().toISOString(),
    guildId,
    adminConfig: getAdminConfig(guildId),
    moduleConfig: verificationStore.getVerificationSection(guildId),
  };
}

function resetVerification(guildId, meta = {}) {
  guildManager.updateGuildSection(guildId, 'modules', (modules = {}) => {
    const next = { ...(modules && typeof modules === 'object' ? modules : {}) };
    delete next.verification;
    return next;
  }, {}, meta);
  return verificationStore.saveVerificationSection(guildId, verificationStore.defaultVerificationSection(), meta);
}

router.get('/:guildId/overview', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    const section = verificationStore.getVerificationSection(guildId);
    const status = verificationManager.getVerificationStatus(guildId);
    const health = guild ? await verificationManager.buildHealthReport(guild) : null;

    return success(res, {
      guildId,
      updatedAt: new Date().toISOString(),
      adminConfig: getAdminConfig(guildId),
      moduleConfig: section,
      status: {
        enabled: status.enabled === true,
        panels: Object.values(status.panels || {}),
        analytics: status.analytics || {},
      },
      health,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/export', (req, res) => {
  try {
    const guildId = getGuildId(req);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="goliath-verification-${guildId}.json"`);
    return res.send(JSON.stringify(buildExport(guildId), null, 2));
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/config', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = saveAdminConfig(guildId, req.body || {}, { action: 'verification_api_config', actorId: getActorId(req) });
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/template', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const template = verificationManager.updatePanelTemplate(guildId, req.body || {}, { action: 'verification_api_template', actorId: getActorId(req) });
    return success(res, { guildId, template });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const adminConfig = getAdminConfig(guildId);
    const channelId = cleanDiscordId(req.body?.channelId || adminConfig.verificationChannelId);
    if (!channelId) throw new Error('Verification channel is required.');
    const channel = await getSendableChannel(req, guildId, channelId);
    const existingPanelId = req.body?.redeploy === true ? verificationStore.getLatestPanel(guildId)?.panelId : cleanDiscordId(req.body?.panelId) || req.body?.panelId;
    const panel = await verificationManager.deployVerificationPanel(channel, {
      ...(verificationStore.getVerificationSection(guildId).panelTemplate || {}),
      ...(req.body?.template || {}),
      panelId: existingPanelId,
      createdBy: getActorId(req),
    }, { action: 'verification_api_deploy', actorId: getActorId(req) });
    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/panels/:panelId/redeploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const panel = await verificationManager.refreshVerificationPanel(guild, req.params.panelId, req.body || {}, { action: 'verification_api_redeploy', actorId: getActorId(req) });
    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/panels/:panelId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const section = await verificationManager.deleteVerificationPanel(guild, req.params.panelId, { action: 'verification_api_delete_panel', actorId: getActorId(req) });
    return success(res, { guildId, section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/reset', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = resetVerification(guildId, { action: 'verification_api_reset', actorId: getActorId(req) });
    return success(res, { guildId, section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
