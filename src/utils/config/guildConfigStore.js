const fs = require('fs');
const path = require('path');

// Shared data location used by BOTH bot and dashboard
const dataDir = path.join(__dirname, '../../../dashboard/server/data');
const filePath = path.join(dataDir, 'guildConfigs.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function ensureFile() {
  ensureDataDir();

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
    return;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');

    if (!raw.trim()) {
      fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('❌ Failed to verify guildConfigs.json:', error);
  }
}

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

function loadConfigs() {
  try {
    ensureFile();

    const raw = fs.readFileSync(filePath, 'utf8');

    if (!raw || !raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized = {};

    for (const [guildId, config] of Object.entries(parsed)) {
      normalized[guildId] = normalizeGuildConfig(config);
    }

    return normalized;
  } catch (error) {
    console.error('❌ Failed to load guild configs:', error);
    return {};
  }
}

function saveConfigs(configs) {
  try {
    ensureFile();
    fs.writeFileSync(filePath, JSON.stringify(configs, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Failed to save guild configs:', error);
  }
}

function getAllGuildConfigs() {
  return loadConfigs();
}

function getGuildConfig(guildId) {
  if (!guildId) return getDefaultGuildConfig();

  const configs = loadConfigs();
  return normalizeGuildConfig(configs[guildId] || {});
}

function setGuildConfig(guildId, partialConfig = {}) {
  if (!guildId) {
    throw new Error('guildId is required in setGuildConfig');
  }

  const configs = loadConfigs();
  const currentConfig = normalizeGuildConfig(configs[guildId] || {});

  configs[guildId] = {
    ...currentConfig,
    ...partialConfig,
    guildId,
    updatedAt: new Date().toISOString(),
  };

  saveConfigs(configs);
  return configs[guildId];
}

function replaceGuildConfig(guildId, nextConfig = {}) {
  if (!guildId) {
    throw new Error('guildId is required in replaceGuildConfig');
  }

  const configs = loadConfigs();

  configs[guildId] = {
    ...normalizeGuildConfig(nextConfig),
    guildId,
    updatedAt: new Date().toISOString(),
  };

  saveConfigs(configs);
  return configs[guildId];
}

function deleteGuildConfigKey(guildId, key) {
  if (!guildId || !key) {
    return getDefaultGuildConfig();
  }

  const configs = loadConfigs();

  if (!configs[guildId] || typeof configs[guildId] !== 'object') {
    return getDefaultGuildConfig();
  }

  delete configs[guildId][key];
  configs[guildId] = {
    ...normalizeGuildConfig(configs[guildId]),
    guildId,
    updatedAt: new Date().toISOString(),
  };

  saveConfigs(configs);
  return configs[guildId];
}

function deleteGuildConfig(guildId) {
  if (!guildId) return false;

  const configs = loadConfigs();

  if (!configs[guildId]) {
    return false;
  }

  delete configs[guildId];
  saveConfigs(configs);
  return true;
}

module.exports = {
  getDefaultGuildConfig,
  getAllGuildConfigs,
  getGuildConfig,
  setGuildConfig,
  replaceGuildConfig,
  deleteGuildConfigKey,
  deleteGuildConfig,
  dataDir,
  filePath,
};