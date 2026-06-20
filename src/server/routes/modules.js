'use strict';

const express = require('express');

const {
  getGuildData,
  setModuleEnabled,
} = require('../../guild/guildManager');

const autoRoleStore = require('../../modules/autoRoles/autoRoleStore');
const autoRoleManager = require('../../modules/autoRoles/autoRoleManager');
const verificationStore = require('../../modules/verification/verificationStore');
const verificationManager = require('../../modules/verification/verificationManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Modules API]', error);
  return res.status(status).json({
    success: false,
    error: error.message || 'Modules API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) {
    throw new Error('Invalid guild ID.');
  }
  return guildId;
}

function normalizeModuleMap(modules = {}) {
  const output = {};

  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
    return output;
  }

  for (const [key, value] of Object.entries(modules)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = {
        ...value,
        enabled: value.enabled !== false,
      };
      continue;
    }

    if (typeof value === 'boolean') {
      output[key] = { enabled: value !== false };
      continue;
    }

    output[key] = { enabled: true };
  }

  return output;
}

async function fetchGuild(req, guildId) {
  const client = req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient;
  if (!client?.guilds?.fetch) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function fetchChannel(req, guildId, channelId) {
  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');

  const cleanChannelId = String(channelId || '').replace(/[<#>]/g, '').trim();
  if (!/^\d{15,25}$/.test(cleanChannelId)) throw new Error('Invalid channel ID.');

  const channel = guild.channels.cache.get(cleanChannelId) || await guild.channels.fetch(cleanChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Channel is not sendable.');

  return channel;
}

router.get('/:guildId/auto-roles', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleStore.getAutoRolesSection(guildId);

    return success(res, {
      guildId,
      config,
      overview: {
        enabled: config.enabled !== false,
        joinRoleCount: (config.joinRoles || []).length,
        botRoleCount: (config.botRoles || []).length,
        applyToBots: config.settings?.applyToBots === true,
        analytics: config.analytics || {},
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/auto-roles/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleManager.setAutoRolesEnabled(guildId, req.body?.enabled === true, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/auto-roles/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleStore.updateSettings(guildId, req.body?.settings || req.body || {}, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/auto-roles', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleManager.configureAutoRoles(guildId, req.body || {}, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/auto-roles/join', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');

    const result = await autoRoleManager.addAutoRole(guild, req.body?.roleId, { bot: false }, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, roleId: result.role.id, config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/auto-roles/join/:roleId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleManager.removeAutoRole(guildId, req.params.roleId, { bot: false }, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/auto-roles/bots', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');

    const result = await autoRoleManager.addAutoRole(guild, req.body?.roleId, { bot: true }, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, roleId: result.role.id, config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/auto-roles/bots/:roleId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = autoRoleManager.removeAutoRole(guildId, req.params.roleId, { bot: true }, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/auto-roles/analytics', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, {
      guildId,
      analytics: autoRoleManager.getAutoRoleAnalytics(guildId),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/verification', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = verificationStore.getVerificationSection(guildId);

    return success(res, {
      guildId,
      config,
      overview: {
        enabled: config.enabled === true,
        panelCount: Object.keys(config.panels || {}).length,
        verifiedRoleId: config.settings?.verifiedRoleId || null,
        unverifiedRoleId: config.settings?.unverifiedRoleId || null,
        analytics: config.analytics || {},
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/verification/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = verificationManager.setVerificationEnabled(guildId, req.body?.enabled === true, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/verification/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = verificationManager.configureVerification(guildId, {
      settings: req.body?.settings || req.body || {},
    }, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/verification', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = verificationManager.configureVerification(guildId, req.body || {}, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/verification/panels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = verificationStore.savePanel(guildId, req.body || {}, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/verification/panels/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const channel = await fetchChannel(req, guildId, req.body?.channelId);
    const panel = await verificationManager.deployVerificationPanel(channel, req.body || {}, {
      actorId: req.body?.actorId,
    });

    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/verification/panels/:panelId/refresh', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await fetchGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');

    const panel = await verificationManager.refreshVerificationPanel(
      guild,
      req.params.panelId,
      req.body || {},
      { actorId: req.body?.actorId }
    );

    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/verification/analytics', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = verificationStore.getVerificationSection(guildId);
    return success(res, {
      guildId,
      analytics: config.analytics || {},
      panels: Object.values(config.panels || {}),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const guildData = getGuildData(guildId);

    return res.json({
      success: true,
      guildId,
      modules: normalizeModuleMap(guildData.modules || {}),
    });
  } catch (error) {
    console.error('❌ Failed to load guild modules');
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load guild modules.',
    });
  }
});

router.patch('/:guildId/:moduleKey/enabled', (req, res) => {
  try {
    const { guildId, moduleKey } = req.params;
    const enabled = req.body?.enabled === true;

    const modules = setModuleEnabled(guildId, moduleKey, enabled);

    return res.json({
      success: true,
      guildId,
      moduleKey,
      enabled,
      modules: normalizeModuleMap(modules || {}),
    });
  } catch (error) {
    console.error('❌ Failed to update guild module state');
    console.error(error);

    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to update guild module state.',
    });
  }
});

module.exports = router;