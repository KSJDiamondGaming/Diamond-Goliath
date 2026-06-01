const terminal = require('../../logging/terminalLogger').createLogger('bot');

const {
  restoreLockdownReminders,
} = require('../../security/lockdownSystem');

const {
  startbackupWorker,
} = require('../../security/backup/backupWorker');

const {
  startupTickets,
} = require('../../modules/tickets/ticketStartup');

function getPrimaryGuildIdForMode(mode) {
  if (mode === 'DEV') {
    return (
      process.env.DEV_GUILD_ID ||
      process.env.MAIN_GUILD_ID ||
      process.env.GUILD_ID ||
      null
    );
  }

  if (mode === 'BETA') {
    return (
      process.env.BETA_GUILD_IDS?.split(',')?.[0]?.trim() ||
      process.env.BETA_GUILD_ID ||
      process.env.MAIN_GUILD_ID ||
      process.env.GUILD_ID ||
      null
    );
  }

  return null;
}

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

    const isPublicProduction =
      currentMode === 'PRODUCTION';

    const primaryGuildId =
      getPrimaryGuildIdForMode(currentMode);

    const primaryGuild = primaryGuildId
      ? client.guilds.cache.get(primaryGuildId)
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
      const ticketStartup =
        await startupTickets(client);

      terminal.success(
        `Ticket recovery initialized (${ticketStartup.totalActiveTickets || 0} active ticket(s), ${ticketStartup.totalMissingChannels || 0} missing channel(s))`
      );
    } catch (error) {
      terminal.error(
        'Ticket recovery failed',
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

    const bannerItems = [
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
    ];

    if (isPublicProduction) {
      bannerItems.push({
        label: 'Public Guilds',
        value: String(client.guilds.cache.size),
        ok: client.guilds.cache.size > 0,
      });
    } else {
      bannerItems.push({
        label: 'Primary Guild',
        value: primaryGuild
          ? `${primaryGuild.name} (${primaryGuild.id})`
          : 'Not Connected',
        ok: Boolean(primaryGuild),
      });

      bannerItems.push({
        label: 'Connected Guilds',
        value: String(client.guilds.cache.size),
        ok: client.guilds.cache.size > 0,
      });
    }

    bannerItems.push({
      label: 'Systems',
      value:
        'Scheduler + Lockdown Recovery + Ticket Recovery + Backup Sync Worker',
      ok: true,
    });

    terminal.banner(bannerItems);

    terminal.success('Bot ready');
  },
};