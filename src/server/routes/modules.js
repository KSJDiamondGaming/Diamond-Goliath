'use strict';

const express = require('express');

const {
  getGuildData,
  getGuildSection,
  saveGuildSection,
  saveEmbedPreset,
  deleteEmbedPreset,
  setModuleEnabled,
} = require('../../core/guild/guildManager');

const autoRoleStore = require('../../modules/autoRoles/autoRoleStore');
const autoRoleManager = require('../../modules/autoRoles/autoRoleManager');
const verificationStore = require('../../modules/verification/verificationStore');
const verificationManager = require('../../modules/verification/verificationManager');
const {
  getAllEmbedDeployments,
  deleteEmbedDeployment,
} = require('../../modules/embed/functions/embedDeploymentStore');
const {
  isGoliathPermissionError,
  validateRoleSelection,
} = require('../../core/security/goliathPermissionGuard');
const { requirePlanLimit } = require('../middleware/requirePlanLimit');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Modules API]', error);

  if (isGoliathPermissionError(error)) {
    const details = error.details || {};

    return res.status(403).json({
      success: false,
      code: error.code,
      error: error.message,
      message: details.message || error.message,
      scope: details.scope || null,
      guildId: details.guildId || null,
      failures: details.failures || [],
      missingPermissions: details.missingPermissions || [],
      metadata: details.metadata || {},
      autoFixAvailable: Boolean(details.autoFixAvailable),
      confirmationRequired: Boolean(details.confirmationRequired),
    });
  }

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

function cleanPresetName(value) {
  const name = String(value || '').trim().slice(0, 50);
  if (!name) throw new Error('Preset name is required.');
  return name;
}

function cleanDeploymentKey(value) {
  const key = String(value || '').trim().slice(0, 100);
  if (!key) throw new Error('Deployment key is required.');
  return key;
}

function countEmbedPresetsForLimit(req) {
  const guildId = getGuildId(req);
  const name = cleanPresetName(req.body?.name);
  const presets = getGuildSection(guildId, 'embedPresets', {});
  return Object.keys(presets || {}).filter((key) => key !== 'updatedAt' && key !== name).length;
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

function getDiscordClient(req) {
  return (
    req.client ||
    req.app?.get?.('goliath.client') ||
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    global.client ||
    global.discordClient ||
    null
  );
}

async function fetchGuild(req, guildId) {
  const client = getDiscordClient(req);
  if (!client?.guilds) return null;
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

async function guardManageableRoles(guild, roleIds = [], scope = 'roles') {
  const cleanRoleIds = autoRoleStore.cleanRoleIds(roleIds);
  if (!cleanRoleIds.length) return null;

  const result = await validateRoleSelection(guild, cleanRoleIds, {
    scope,
    requireManageable: true,
  });

  if (!result.ok) throw result.toError();
  return result;
}

async function guardAutoRoleConfig(req, guildId, input = {}) {
  const roleIds = [
    ...(Array.isArray(input.joinRoles) ? input.joinRoles : []),
    ...(Array.isArray(input.botRoles) ? input.botRoles : []),
  ];

  if (!roleIds.length) return null;

  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');

  return guardManageableRoles(guild, roleIds, 'auto_roles.config_roles');
}

async function guardVerificationRoles(req, guildId, input = {}) {
  const settings = input.settings && typeof input.settings === 'object'
    ? input.settings
    : input;

  const roleIds = [
    settings?.verifiedRoleId,
    settings?.unverifiedRoleId,
  ].filter(Boolean);

  if (!roleIds.length) return null;

  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');

  return guardManageableRoles(guild, roleIds, 'verification.roles');
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

router.put('/:guildId/auto-roles', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardAutoRoleConfig(req, guildId, req.body || {});

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

    await guardManageableRoles(guild, [req.body?.roleId], 'auto_roles.join_role');

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

    await guardManageableRoles(guild, [req.body?.roleId], 'auto_roles.bot_role');

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

router.get('/:guildId/embed-studio', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const builder = getGuildSection(guildId, 'embedBuilder', { draft: {}, templates: {}, deployments: {} });
    const presets = getGuildSection(guildId, 'embedPresets', {});
    const defaults = getGuildSection(guildId, 'embedDefaults', {});
    const deployments = getAllEmbedDeployments(guildId);

    return success(res, {
      guildId,
      builder: {
        ...builder,
        deployments,
      },
      presets,
      defaults,
      overview: {
        draftSaved: Boolean(builder?.draft),
        presetCount: Object.keys(presets || {}).filter((key) => key !== 'updatedAt').length,
        templateCount: Object.keys(builder?.templates || {}).length,
        deploymentCount: Object.keys(deployments || {}).length,
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post(
  '/:guildId/embed-studio/presets',
  requirePlanLimit('embedPresets', countEmbedPresetsForLimit, {
    upgradeHint: 'Upgrade to Plus or Pro to save more embed presets.',
  }),
  (req, res) => {
    try {
      const guildId = getGuildId(req);
      const name = cleanPresetName(req.body?.name);
      const preset = saveEmbedPreset(guildId, name, {
        ...(req.body?.embed && typeof req.body.embed === 'object' ? req.body.embed : {}),
        content: String(req.body?.content || '').slice(0, 2000),
        embed: req.body?.embed && typeof req.body.embed === 'object' ? req.body.embed : {},
        name,
      });
      const presets = getGuildSection(guildId, 'embedPresets', {});

      return success(res, { guildId, name, preset, presets });
    } catch (error) {
      return failure(res, error, 400);
    }
  }
);

router.delete('/:guildId/embed-studio/presets/:name', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const name = cleanPresetName(req.params.name);
    const deleted = deleteEmbedPreset(guildId, name);
    const presets = getGuildSection(guildId, 'embedPresets', {});

    return success(res, { guildId, name, deleted, presets });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/embed-studio/deployments/:key', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const key = cleanDeploymentKey(req.params.key);
    const deleted = deleteEmbedDeployment(guildId, key);
    const builder = getGuildSection(guildId, 'embedBuilder', { draft: {}, templates: {}, deployments: {} });
    const deployments = getAllEmbedDeployments(guildId);

    return success(res, {
      guildId,
      key,
      deleted,
      builder: {
        ...builder,
        deployments,
      },
      deployments,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
