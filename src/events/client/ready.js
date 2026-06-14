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

const {
  startupRoles,
} = require('../../modules/roles/roleStartup');

const {
  startupTranslation,
} = require('../../modules/translation/translationStartup');

const {
  startGiveawayScheduler,
} = require('../../modules/giveaways/giveawayManager');

const {
  startStatusRotation,
} = require('./status');

function getEnvList(name) {
  const value = process.env[name];

  if (!value) return [];

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPrimaryGuildIdsForMode(mode) {
  if (mode === 'DEV') {
    return [
      ...getEnvList('DEV_GUILD_ID'),
      ...getEnvList('MAIN_GUILD_ID'),
      ...getEnvList('GUILD_ID'),
    ];
  }

  if (mode === 'BETA') {
    return [
      ...getEnvList('BETA_GUILD_IDS'),
      ...getEnvList('BETA_GUILD_ID'),
      ...getEnvList('MAIN_GUILD_ID'),
      ...getEnvList('GUILD_ID'),
    ];
  }

  return [];
}

function findPrimaryGuild(client, mode) {
  const guildIds = getPrimaryGuildIdsForMode(mode);

  for (const guildId of guildIds) {
    const guild = client.guilds.cache.get(guildId);

    if (guild) {
      return guild;
    }
  }

  return null;
}

function getConnectedGuildSummary(client) {
  return client.guilds.cache
    .map((guild) => `${guild.name} (${guild.id})`)
    .join(', ');
}

async function safeRun(label, action, successMessage) {
  try {
    const result = await action();

    if (typeof successMessage === 'function') {
      terminal.success(successMessage(result));
    } else if (successMessage) {
      terminal.success(successMessage);
    }

    return result;
  } catch (error) {
    terminal.error(`${label} failed`, error);
    return null;
  }
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

    const modeLabel = modeLabels[currentMode] || `${currentMode} MODE`;
    const isPublicProduction = currentMode === 'PRODUCTION';

    const primaryGuild = findPrimaryGuild(client, currentMode);
    const connectedGuildSummary = getConnectedGuildSummary(client);

    terminal.line('🧪 Mode', modeLabel);

    if (!isPublicProduction && !primaryGuild) {
      terminal.warn(
        `Primary guild not found. Connected guilds: ${
          connectedGuildSummary || 'None'
        }`
      );
    }

    await safeRun(
      'Status rotation',
      () => startStatusRotation(client),
      `Status rotation initialized (${currentMode})`
    );

    await safeRun(
      'Lockdown recovery',
      () => restoreLockdownReminders(client),
      'Lockdown recovery system initialized'
    );

    await safeRun(
      'Ticket recovery',
      () => startupTickets(client),
      (ticketStartup) =>
        `Ticket recovery initialized (${ticketStartup?.totalActiveTickets || 0} active ticket(s), ${ticketStartup?.totalMissingChannels || 0} missing channel(s))`
    );

    await safeRun(
      'Role system',
      () => startupRoles(client),
      (roleStartup) =>
        `Role system initialized (${roleStartup?.enabledGuilds || 0} enabled guild(s), ${roleStartup?.timedRoleRules || 0} timed rule(s))`
    );

    await safeRun(
      'Translation recovery',
      () => startupTranslation(client),
      (translationStartup) =>
        `Translation recovery initialized (${translationStartup?.channelsRecovered || 0} channel(s))`
    );

    await safeRun(
      'Backup sync worker',
      () => startbackupWorker(),
      (syncWorker) => {
        if (syncWorker?.started) {
          return `Backup sync worker initialized (${syncWorker.intervalMs}ms)`;
        }

        terminal.warn(
          `Backup sync worker not started (${syncWorker?.reason || 'unknown reason'})`
        );

        return null;
      }
    );

    await safeRun(
      'Giveaway scheduler',
      () => startGiveawayScheduler(client),
      (giveawayScheduler) => {
        if (giveawayScheduler) {
          return 'Giveaway scheduler initialized';
        }

        terminal.warn('Giveaway scheduler already running or unavailable');
        return null;
      }
    );

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
        'Status Rotation + Scheduler + Lockdown Recovery + Ticket Recovery + Role System + Translation Recovery + Giveaway Scheduler + Backup Sync Worker',
      ok: true,
    });

    terminal.banner(bannerItems);
    terminal.success('Bot ready');
  },
};
