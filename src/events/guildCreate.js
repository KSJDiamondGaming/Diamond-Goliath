const path = require('node:path');
const { registerCommands } = require('../utils/utility/registerCommands');

module.exports = {
  name: 'guildCreate',

  async execute(guild, client) {
    console.log(`📥 Joined new guild: ${guild.name} (${guild.id})`);

    try {
      const commandsPath = path.join(__dirname, '..', 'commands');

      await registerCommands({
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        commandsPath,
        guildIds: [guild.id],
        client,
        clear: true,
        mode: 'guild',
      });

      console.log(`✅ Commands synced instantly for: ${guild.name}`);
    } catch (err) {
      console.error('❌ Failed to sync commands for new guild', err);
    }
  },
};