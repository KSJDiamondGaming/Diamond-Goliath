const fs = require('fs');
const path = require('path');

module.exports = function syncGuilds(client) {
  const dataPath = path.join(__dirname, '..', 'data', 'guilds.json');

  const guildData = {};

  for (const guild of client.guilds.cache.values()) {
    guildData[guild.id] = {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL ? guild.iconURL() : null,
    };
  }

  fs.writeFileSync(dataPath, JSON.stringify(guildData, null, 2));
};