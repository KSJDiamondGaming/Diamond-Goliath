const terminal = require('../../logging/terminalLogger').createLogger('bot');

const {
  restoreLockdownReminders,
} = require('../../security/lockdownSystem');

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
      await restoreLockdownReminders(client);
      terminal.success('Lockdown recovery system initialized');
    } catch (error) {
      terminal.error('Lockdown recovery failed', error);
    }

    try {
      // Future schedulers can be initialized here.
    } catch (err) {
      terminal.error('Scheduler failed', err);
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
        value: 'Scheduler + Lockdown Recovery',
        ok: true,
      },
    ]);

    terminal.success('Bot ready');
  },
};