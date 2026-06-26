const express = require('express');

const {
  getGuildData,
  saveGuildData,
} = require('../../../core/guild/guildManager');

const {
  DEFAULT_PREFIX,
  LEGACY_UNSET_PREFIX,
  getGuildPrefix,
  normalizePrefix,
} = require('../../../modules/prefix/prefixStore');

const router = express.Router();

const DEFAULT_DASHBOARD_PERMISSIONS = {
  enabled: true,
  syncDiscordRoles: false,
  managerRoleIds: [],
  roleAccess: {},
  moduleAccess: {},
  presets: {
    owner: ['view', 'edit', 'deploy', 'delete', 'sync'],
    admin: ['view', 'edit', 'deploy', 'sync'],
    moderator: ['view', 'edit'],
    support: ['view'],
    viewer: ['view'],
  },
};

const DEFAULT_GENERAL_SETTINGS = {
  prefix: DEFAULT_PREFIX,
  appealUrl: '',
  dashboardEnabled: true,

  managerRoleIds: [],
  dashboardAccessRoleIds: [],
  commandManagerRoleIds: [],
  restrictedChannelIds: [],
  dashboardPermissions: DEFAULT_DASHBOARD_PERMISSIONS,

  commandNotFoundEnabled: true,
  wrongCommandUsageEnabled: true,
  noCommandPermissionsEnabled: true,
  disabledInChannelEnabled: false,
  commandCooldownEnabled: true,

  instantDeleteDataEnabled: false,
};

function safeArray(value) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePermissionList(value) {
  const allowed = new Set(['view', 'edit', 'deploy', 'delete', 'sync', 'admin']);
  return safeArray(value).filter((permission) => allowed.has(permission));
}

function normalizeDashboardPermissions(value = {}) {
  const source = safeObject(value);
  const roleAccess = safeObject(source.roleAccess);
  const moduleAccess = safeObject(source.moduleAccess);

  return {
    ...DEFAULT_DASHBOARD_PERMISSIONS,
    ...source,
    enabled: source.enabled !== false,
    syncDiscordRoles: source.syncDiscordRoles === true,
    managerRoleIds: safeArray(source.managerRoleIds),
    roleAccess: Object.fromEntries(
      Object.entries(roleAccess).map(([roleId, access]) => [String(roleId), normalizePermissionList(access)])
    ),
    moduleAccess: Object.fromEntries(
      Object.entries(moduleAccess).map(([moduleKey, perRole]) => [
        String(moduleKey),
        Object.fromEntries(
          Object.entries(safeObject(perRole)).map(([roleId, access]) => [String(roleId), normalizePermissionList(access)])
        ),
      ])
    ),
    presets: {
      ...DEFAULT_DASHBOARD_PERMISSIONS.presets,
      ...safeObject(source.presets),
    },
  };
}

function normalizePrefixForSave(value) {
  const raw = String(value || '').trim();

  if (!raw || raw === LEGACY_UNSET_PREFIX) {
    return DEFAULT_PREFIX;
  }

  return normalizePrefix(raw);
}

function normalize(data = {}, options = {}) {
  const prefix = options.guildId
    ? getGuildPrefix(options.guildId)
    : normalizePrefixForSave(data.prefix || DEFAULT_PREFIX);

  return {
    prefix,
    appealUrl: data.appealUrl || '',
    dashboardEnabled: data.dashboardEnabled !== false,

    managerRoleIds: safeArray(data.managerRoleIds),
    dashboardAccessRoleIds: safeArray(data.dashboardAccessRoleIds),
    commandManagerRoleIds: safeArray(data.commandManagerRoleIds),
    restrictedChannelIds: safeArray(data.restrictedChannelIds),
    dashboardPermissions: normalizeDashboardPermissions(data.dashboardPermissions),

    commandNotFoundEnabled: data.commandNotFoundEnabled !== false,
    wrongCommandUsageEnabled: data.wrongCommandUsageEnabled !== false,
    noCommandPermissionsEnabled: data.noCommandPermissionsEnabled !== false,
    disabledInChannelEnabled: data.disabledInChannelEnabled === true,
    commandCooldownEnabled: data.commandCooldownEnabled !== false,

    instantDeleteDataEnabled: data.instantDeleteDataEnabled === true,
  };
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const guildData = getGuildData(guildId);

    return res.json({
      success: true,
      guildId,
      config: {
        ...DEFAULT_GENERAL_SETTINGS,
        ...normalize(guildData.generalSettings || {}, { guildId }),
      },
    });
  } catch (error) {
    console.error('❌ Failed to load general settings');
    console.error(error);

    return res.status(500).json({
      success: false,
      error: 'Failed to load general settings.',
    });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const updatedConfig = normalize({
      ...DEFAULT_GENERAL_SETTINGS,
      ...(req.body || {}),
      prefix: normalizePrefixForSave(req.body?.prefix),
    });

    saveGuildData(guildId, {
      generalSettings: {
        ...updatedConfig,
        updatedAt: new Date().toISOString(),
      },
    });

    return res.json({
      success: true,
      guildId,
      config: updatedConfig,
    });
  } catch (error) {
    console.error('❌ Failed to save general settings');
    console.error(error);

    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to save general settings.',
    });
  }
});

module.exports = router;
