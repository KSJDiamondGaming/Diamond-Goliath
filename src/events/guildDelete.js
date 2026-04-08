const syncGuilds = require('../utils/syncGuilds');

module.exports = {
  name: 'guildDelete',
  execute(guild) {
    syncGuilds(guild.client);
    console.log(`➖ Removed from guild: ${guild.name} (${guild.id})`);
  },
};