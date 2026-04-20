const terminal = require('../utils/utility/terminalLogger').createLogger('bot');
const punishmentScheduler = require('../utils/moderation/punishmentScheduler');
const stats = require('../utils/stats/statsManager');

const MAIN_GUILD_ID = '808091031350280213';

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID);
    const syncMode = String(process.env.COMMAND_SYNC_MODE || 'dev').toLowerCase();
    const isDevMode = syncMode === 'dev';

    terminal.line(
      '🧪 Mode',
      isDevMode ? 'DEV (Main Guild Only)' : 'GLOBAL (Public Bot)'
    );

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

    client.isBooting = false;

    terminal.banner([
      {
        label: 'Bot',
        value: 'READY',
        ok: true,
      },
      {
        label: 'Mode',
        value: isDevMode ? 'DEV (Main Guild)' : 'GLOBAL (Public)',
        ok: true,
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
      {
        label: 'Systems',
        value: 'Scheduler, Stats',
        ok: true,
      },
    ]);

    terminal.success('Bot ready');

    try {
      const commandData = client.commands.map((cmd) => cmd.data);

      if (isDevMode) {
        if (!mainGuild) {
          terminal.error('Main guild not found, cannot sync commands.');
        } else {
          await mainGuild.commands.set(commandData);
          terminal.success('Commands synced to main guild');
        }
      } else {
        await client.application.commands.set(commandData);
        terminal.success('Global commands synced');
      }
    } catch (err) {
      terminal.error('Command sync failed', err);
    }
  },
};