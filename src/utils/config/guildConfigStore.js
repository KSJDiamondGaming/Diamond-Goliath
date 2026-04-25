const guildManager = require('../../../dashboard/server/utils/guildManager');

function getDefaultGuildConfig() {
  return {
    logsChannelId: null,
    modLogChannelId: null,
    adminLogChannelId: null,
    automodLogChannelId: null,
    adminActionLoggerEnabled: false,
  };
}

function normalizeGuildConfig(config = {}) {
  return {
    ...getDefaultGuildConfig(),
    ...(config || {}),
  };
}

function getAllGuildConfigs() {
  const files = guildManager.listGuildFiles();
  const configs = {};

  for (const filePath of files) {
    const match = String(filePath).match(/(\d{16,20})\.json$/);
    if (!match) continue;

    const guildId = match[1];
    configs[guildId] = getGuildConfig(guildId);
  }

  return configs;
}

function getGuildConfig(guildId) {
  if (!guildId) return getDefaultGuildConfig();

  return normalizeGuildConfig(
    guildManager.getGuildSection(guildId, 'config', getDefaultGuildConfig())
  );
}

function setGuildConfig(guildId, partialConfig = {}) {
  if (!guildId) {
    throw new Error('guildId is required in setGuildConfig');
  }

  const currentConfig = getGuildConfig(guildId);

  return guildManager.saveGuildSection(guildId, 'config', {
    ...currentConfig,
    ...partialConfig,
    guildId,
    updatedAt: new Date().toISOString(),
  });
}

function replaceGuildConfig(guildId, nextConfig = {}) {
  if (!guildId) {
    throw new Error('guildId is required in replaceGuildConfig');
  }

  return guildManager.replaceGuildSection(guildId, 'config', {
    ...normalizeGuildConfig(nextConfig),
    guildId,
    updatedAt: new Date().toISOString(),
  });
}

function deleteGuildConfigKey(guildId, key) {
  if (!guildId || !key) {
    return getDefaultGuildConfig();
  }

  const currentConfig = getGuildConfig(guildId);
  delete currentConfig[key];

  return replaceGuildConfig(guildId, currentConfig);
}

function deleteGuildConfig(guildId) {
  if (!guildId) return false;

  return guildManager.replaceGuildSection(
    guildId,
    'config',
    getDefaultGuildConfig()
  );
}

module.exports = {
  getDefaultGuildConfig,
  getAllGuildConfigs,
  getGuildConfig,
  setGuildConfig,
  replaceGuildConfig,
  deleteGuildConfigKey,
  deleteGuildConfig,
};