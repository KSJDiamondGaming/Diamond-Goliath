const syncGuilds = require('../utils/syncGuilds');

module.exports = {
  name: 'guildCreate',
  execute(guild) {
    syncGuilds(guild.client);
    console.log(`➕ Joined guild: ${guild.name} (${guild.id})`);
  },
};