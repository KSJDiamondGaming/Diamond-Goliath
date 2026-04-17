const path = require('node:path');

const terminal = require('../utils/utility/terminalLogger').createLogger('bot');
const { registerCommands } = require('../utils/utility/registerCommands');
const punishmentScheduler = require('../utils/moderation/punishmentScheduler');
const stats = require('../utils/stats/statsManager');

const MAIN_GUILD_ID = '808091031350280213';

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const commandsPath = path.join(__dirname, '..', 'commands');
    const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID);

    const syncMode = String(process.env.COMMAND_SYNC_MODE || 'dev').toLowerCase();
    const isDevMode = syncMode === 'dev';

    let syncInfo = { synced: 0, durationMs: 0, scope: 'unknown' };

    try {
      if (isDevMode) {
        terminal.line('🧪 Mode', 'DEV (Guild Commands Only)');

        syncInfo = await registerCommands({
          token: process.env.TOKEN,
          clientId: process.env.CLIENT_ID,
          commandsPath,
          client,
          guildIds: [MAIN_GUILD_ID],
          clear: true,
          mode: 'guild',
        });
      } else {
        terminal.line('🌍 Mode', 'GLOBAL (All Guilds)');

        syncInfo = await registerCommands({
          token: process.env.TOKEN,
          clientId: process.env.CLIENT_ID,
          commandsPath,
          client,
          clear: false,
          mode: 'global',
        });
      }
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
      {
        label: 'Mode',
        value: isDevMode ? 'DEV (Guild)' : 'GLOBAL',
        ok: true,
      },
      {
        label: 'Sync',
        value: `${syncInfo.synced} cmds / ${syncInfo.durationMs}ms`,
        ok: syncInfo.synced > 0,
      },
      {
        label: 'Main Guild',
        value: mainGuild
          ? `${mainGuild.name} (${mainGuild.id})`
          : `Missing (${MAIN_GUILD_ID})`,
        ok: Boolean(mainGuild),
      },
      {
        label: 'Connected Guilds',
        value: String(client.guilds.cache.size),
        ok: client.guilds.cache.size > 0,
      },
      { label: 'Systems', value: 'Scheduler, Stats', ok: true },
    ]);

    terminal.success('Bot ready');
  },
};