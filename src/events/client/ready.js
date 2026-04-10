const path = require('node:path');

const { registerCommands } = require('../../utils/registerCommands');
const { startScheduler } = require('../../utils/punishmentScheduler');
const stats = require('../../utils/stats/statsManager');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    // ===== Internal API =====
    const express = require('express');
    const botApi = express();

    botApi.get('/internal/guilds', (req, res) => {
      const guilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
      }));

      res.json(guilds);
    });

    botApi.listen(3002, () => {
      console.log('🌐 API running on http://localhost:3002');
    });

    // ===== Command Sync =====
    const commandsPath = path.join(process.cwd(), 'src', 'commands');

    await registerCommands({
      token: process.env.TOKEN,
      clientId: process.env.CLIENT_ID,
      commandsPath,
      mode: 'global',
      clear: true,
    });

    await registerCommands({
      token: process.env.TOKEN,
      clientId: process.env.CLIENT_ID,
      commandsPath,
      guildIds: process.env.GUILD_IDS.split(','),
      mode: 'guild',
    });

    // ===== Systems =====
    startScheduler(client);
    stats.start(client);

    console.log('🚀 Bot ready');
  },
};