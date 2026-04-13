const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../data/automodSettings.json');

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('❌ Failed to load automod config:', error);
    return {};
  }
}

function saveConfig(data) {
  try {
    const dir = path.dirname(CONFIG_PATH);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Failed to save automod config:', error);
  }
}

function createDefaultAutomodConfig() {
  return {
    enabled: false,
    ignoreBots: true,
    ignoreAdmins: true,
    logs: {
      enabled: false,
      channelId: null,
    },
  };
}

function ensureGuildConfig(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = {};
  }

  if (!data[guildId].automod) {
    data[guildId].automod = createDefaultAutomodConfig();
  }

  if (typeof data[guildId].automod.logs !== 'object' || !data[guildId].automod.logs) {
    data[guildId].automod.logs = {
      enabled: false,
      channelId: null,
    };
  }

  return data[guildId].automod;
}

function getGuildAutomodConfig(guildId) {
  const data = loadConfig();
  const config = ensureGuildConfig(data, guildId);
  saveConfig(data);
  return config;
}

function setGuildAutomodConfig(guildId, newConfig = {}) {
  const data = loadConfig();
  ensureGuildConfig(data, guildId);

  data[guildId].automod = {
    enabled: Boolean(newConfig.enabled),
    ignoreBots: Boolean(newConfig.ignoreBots),
    ignoreAdmins: Boolean(newConfig.ignoreAdmins),
    logs: {
      enabled: Boolean(newConfig.logs?.enabled),
      channelId: newConfig.logs?.channelId || null,
    },
  };

  saveConfig(data);
  return data[guildId].automod;
}

module.exports = {
  loadConfig,
  saveConfig,
  createDefaultAutomodConfig,
  ensureGuildConfig,
  getGuildAutomodConfig,
  setGuildAutomodConfig,
};