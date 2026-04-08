const { Events } = require('discord.js');
const syncGuilds = require('../utils/syncGuilds');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`🔥 KSJ Goliath is online as ${client.user.tag}`);
    syncGuilds(client);
  },
};