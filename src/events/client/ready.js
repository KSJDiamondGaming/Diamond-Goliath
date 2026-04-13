const path = require('node:path');

const { registerCommands } = require('../../utils/registerCommands');
const punishmentScheduler = require('../../utils/moderation/punishmentScheduler');
const stats = require('../../utils/stats/statsManager');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);

    if (client.guilds.cache.size > 0) {
      console.log('📍 Connected guilds:');
      for (const guild of client.guilds.cache.values()) {
        console.log(`- ${guild.name} (${guild.id})`);
      }
    } else {
      console.log('📍 No guilds connected');
    }

    const commandsPath = path.join(__dirname, '..', '..', 'commands');

    try {
      await registerCommands({
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        commandsPath,
        client,
        clear: false,
      });
    } catch (err) {
      console.error('❌ Command registration failed:', err);
    }

    try {
      punishmentScheduler.start?.(client);
      console.log('⏱️ Punishment scheduler started');
    } catch (err) {
      console.error('❌ Failed to start punishment scheduler:', err);
    }

    try {
      stats.start?.(client);
      console.log('📊 Stats system started');
    } catch (err) {
      console.error('❌ Failed to start stats system:', err);
    }

    console.log('🚀 Bot ready');
  },
};