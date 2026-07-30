'use strict';

const express = require('express');
const { PermissionFlagsBits } = require('discord.js');
const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');
const verificationHealth = require('./verificationHealth');
const guildManager = require('../../core/guild/guildManager');
const security = require('../../core/security/securityCore');

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
  return cleanDiscordId(req.verificationActorId || req.session?.user?.id);
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

async function requireVerificationGuildAccess(req, res, next) {
  try {
    const userId = cleanDiscordId(req.session?.user?.id);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const guildId = getGuildId(req);
    req.verificationActorId = userId;

    if (security.isBotOwner(userId)) return next();

    const guild = await getGuild(req, guildId);
    if (!guild) {
      return res.status(403).json({ success: false, error: 'Guild is unavailable or not accessible.' });
    }

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have access to manage this server.' });
    }

    const allowed = member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Manage Server permission is required.' });
    }

    return next();
  } catch (error) {
    return failure(res, error, 403);
  }
}

router.use('/:guildId', requireVerificationGuildAccess);

function getConfig(guildId) {
  const section = verificationManager.getVerificationStatus(guildId);
  return {
    enabled: guildManager.isModuleEnabled(guildId, 'verification') === true,
    ...section.settings,
  };
}

function saveConfig(guildId, input = {}, meta = {}) {
  const current = verificationManager.getVerificationStatus(guildId);
  const settingsInput = input.settings && typeof input.settings === 'object' ? input.settings : input;
  const settings = verificationStore.normalizeSettings({ ...current.settings, ...settingsInput });

  if (input.enabled !== undefined) {
    guildManager.setModuleEnabled(guildId, 'verification', input.enabled === true, meta);
  }

  verificationManager.configureVerification(guildId, { settings }, meta);
  return getConfig(guildId);
}

function buildExport(guildId) {
  return {
    exportedAt: new Date().toISOString(),
    guildId,
    config: getConfig(guildId),
    module: verificationStore.getVerificationSection(guildId),
  };
}

function resetVerification(guildId, meta = {}) {
  const section = verificationStore.saveVerificationSection(
    guildId,
    verificationStore.defaultVerificationSection(),
    meta,
  );
  guildManager.setModuleEnabled(guildId, 'verification', false, meta);
  return section;
}

router.get('/:guildId/overview', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    const section = verificationStore.getVerificationSection(guildId);
    const health = guild ? await verificationHealth.buildHealthReport(guild) : null;

    return success(res, {
      guildId,
      updatedAt: new Date().toISOString(),
      config: getConfig(guildId),
      messages: section.messages,
      panelTemplate: section.panelTemplate,
      panels: Object.values(section.panels || {}),
      analytics: section.analytics || {},
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
    const config = saveConfig(guildId, req.body || {}, {
      action: 'verification_api_config',
      actorId: getActorId(req),
    });
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/messages', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const messages = verificationManager.updateVerificationMessages(guildId, req.body || {}, {
      action: 'verification_api_messages',
      actorId: getActorId(req),
    });
    return success(res, { guildId, messages });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/template', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const template = verificationManager.updatePanelTemplate(guildId, req.body || {}, {
      action: 'verification_api_template',
      actorId: getActorId(req),
    });
    return success(res, { guildId, template });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = getConfig(guildId);
    const channelId = cleanDiscordId(req.body?.channelId || config.verificationChannelId);
    if (!channelId) throw new Error('Verification channel is required.');
    const channel = await getSendableChannel(req, guildId, channelId);
    const panelId = req.body?.redeploy === true
      ? verificationStore.getLatestPanel(guildId)?.panelId
      : String(req.body?.panelId || '').trim() || undefined;
    const panel = await verificationManager.deployVerificationPanel(channel, {
      ...verificationStore.getVerificationSection(guildId).panelTemplate,
      ...(req.body?.template || {}),
      panelId,
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
    const panel = await verificationManager.refreshVerificationPanel(guild, req.params.panelId, req.body || {}, {
      action: 'verification_api_redeploy',
      actorId: getActorId(req),
    });
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
    const section = await verificationManager.deleteVerificationPanel(guild, req.params.panelId, {
      action: 'verification_api_delete_panel',
      actorId: getActorId(req),
    });
    return success(res, { guildId, section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/repair', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const health = await verificationHealth.repair(guild, {
      actorId: getActorId(req),
    });
    return success(res, { guildId, health });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/attempts/:userId/reset', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const userId = cleanDiscordId(req.params.userId);
    if (!userId) throw new Error('Invalid user ID.');
    verificationStore.clearAttempts(guildId, userId, {
      action: 'verification_api_reset_attempts',
      actorId: getActorId(req),
    });
    return success(res, { guildId, userId, reset: true });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/reset', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = resetVerification(guildId, {
      action: 'verification_api_reset',
      actorId: getActorId(req),
    });
    return success(res, { guildId, section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
