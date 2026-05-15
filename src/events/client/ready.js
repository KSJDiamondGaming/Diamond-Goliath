const terminal = require('../../logging/terminalLogger').createLogger('bot');

const {
  restoreLockdownReminders,
} = require('../../security/lockdownSystem');

const {
  startbackupWorker,
} = require('../../security/backup/backupWorker');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    const currentMode = client.botMode || 'DEV';

    const modeLabels = {
      DEV: 'DEV (Main Guild Only)',
      BETA: 'BETA (Restricted Servers)',
      PRODUCTION: 'PRODUCTION (Public Bot)',
    };

    const modeLabel =
      modeLabels[currentMode] || `${currentMode} MODE`;

    const mainGuildId =
      process.env.DEV_GUILD_ID ||
      process.env.BETA_GUILD_IDS?.split(',')[0];

    const mainGuild = mainGuildId
      ? client.guilds.cache.get(mainGuildId)
      : null;

    terminal.line('🧪 Mode', modeLabel);

    try {
      await restoreLockdownReminders(client);

      terminal.success(
        'Lockdown recovery system initialized'
      );
    } catch (error) {
      terminal.error(
        'Lockdown recovery failed',
        error
      );
    }

    try {
      const syncWorker =
        startbackupWorker();

      if (syncWorker.started) {
        terminal.success(
          `Backup sync worker initialized (${syncWorker.intervalMs}ms)`
        );
      } else {
        terminal.warn(
          `Backup sync worker not started (${syncWorker.reason})`
        );
      }
    } catch (error) {
      terminal.error(
        'Backup sync worker failed',
        error
      );
    }

    try {
      // Future schedulers can be initialized here.
    } catch (err) {
      terminal.error(
        'Scheduler failed',
        err
      );
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
        value: modeLabel,
        ok: true,
      },
      {
        label: 'Main Guild',
        value: mainGuild
          ? `${mainGuild.name} (${mainGuild.id})`
          : 'Not Connected',
        ok: Boolean(mainGuild),
      },
      {
        label: 'Connected Guilds',
        value: String(
          client.guilds.cache.size
        ),
        ok:
          client.guilds.cache.size > 0,
      },
      {
        label: 'Systems',
        value:
          'Scheduler + Lockdown Recovery + Backup Sync Worker',
        ok: true,
      },
    ]);

    terminal.success('Bot ready');
  },
};