const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../data/guildConfigs.json');

function ensureFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
}

function loadConfigs() {
  ensureFile();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveConfigs(configs) {
  fs.writeFileSync(filePath, JSON.stringify(configs, null, 2));
}

function getGuildConfig(guildId) {
  const configs = loadConfigs();
  return configs[guildId] || {};
}

function setGuildConfig(guildId, newConfig) {
  const configs = loadConfigs();
  configs[guildId] = {
    ...(configs[guildId] || {}),
    ...newConfig
  };
  saveConfigs(configs);
}

module.exports = {
  getGuildConfig,
  setGuildConfig
};