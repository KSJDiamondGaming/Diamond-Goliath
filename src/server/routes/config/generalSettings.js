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

const DEFAULT_GENERAL_SETTINGS = {
  prefix: DEFAULT_PREFIX,
  appealUrl: '',
  dashboardEnabled: true,

  managerRoleIds: [],
  dashboardAccessRoleIds: [],
  commandManagerRoleIds: [],
  restrictedChannelIds: [],

  commandNotFoundEnabled: true,
  wrongCommandUsageEnabled: true,
  noCommandPermissionsEnabled: true,
  disabledInChannelEnabled: false,
  commandCooldownEnabled: true,

  instantDeleteDataEnabled: false,
};

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
