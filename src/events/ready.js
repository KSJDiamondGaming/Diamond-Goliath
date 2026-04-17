const path = require('node:path');

const terminal = require('../utils/utility/terminalLogger').createLogger('bot');
const { registerCommands } = require('../utils/utility/registerCommands');
const punishmentScheduler = require('../utils/moderation/punishmentScheduler');
const stats = require('../utils/stats/statsManager');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const guild = client.guilds.cache.first();
    const commandsPath = path.join(__dirname, '..', '..', 'commands');

    let syncInfo = { synced: 0, durationMs: 0 };

    try {
      syncInfo = await registerCommands({
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        commandsPath,
        client,
        clear: false,
      });
    } catch (err) {
      terminal.error('Command sync failed', err);
    }

    try {
      punishmentScheduler.start?.(client);
    } catch (err) {
      terminal.error('Scheduler failed', err);
    }

    try {
      stats.start?.(client);
    } catch (err) {
      terminal.error('Stats failed', err);
    }

    terminal.banner([
      { label: 'Bot', value: 'READY', ok: true },
      { label: 'Sync', value: `${syncInfo.synced} cmds / ${syncInfo.durationMs}ms`, ok: true },
      { label: 'Guild', value: guild?.name || 'None', ok: Boolean(guild) },
      { label: 'Systems', value: 'Scheduler, Stats', ok: true },
    ]);

    terminal.success('Bot ready');
  },
};