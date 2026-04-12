const fs = require('fs');
const path = require('path');

module.exports = function getEmbedConfig(guildId) {
  const dataPath = path.join(__dirname, '..', 'data', 'embedConfigs.json');

  if (!fs.existsSync(dataPath)) {
    return {};
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const data = raw ? JSON.parse(raw) : {};

  return data[guildId] || {};
};