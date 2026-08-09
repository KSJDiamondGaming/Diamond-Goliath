const { Events } = require('discord.js');
const terminal = require('../../core/logging/terminalLogger').createLogger('bot');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');
const auditStore = require('../../owner/auditIntelligence/auditStore');
const auditRouter = require('../../owner/auditIntelligence/auditRouter');

const {
  restoreLockdownReminders,
} = require('../../core/security/lockdownSystem');

const {
  startbackupWorker,
} = require('../../core/security/backup/backupWorker');

const {
  startStatusRotation,
} = require('../../features/status/statusRotation');

function getEnvList(name) {
  const value = process.env[name];

  if (!value) return [];

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function publishAuditGuildRegistry(client, reason = 'startup') {
  try {
    const registry = auditStore.publishGuildRegistry(client);
    if (registry) terminal.info(`Audit guild registry published: ${registry.guilds.length} guild(s) for ${registry.environment} (${reason})`);
    return registry;
  } catch (error) {
    terminal.error(`Failed to publish Audit Intelligence guild registry (${reason}): ${error?.message || error}`);
    return null;
  }
}

async function restoreAuditReportFeeds(client) {
  const mode = String(client?.botMode || process.env.BOT_MODE || 'DEV').trim().toUpperCase();
  if (mode !== 'DEV') return 0;

  const config = auditStore.getConfig();
  if (config.autoProvision === false || !config.commandCenter?.guildId) return 0;

  const configuredGuilds = config.guilds && typeof config.guilds === 'object' ? config.guilds : {};
  const commandCenterGuildId = String(config.commandCenter.guildId);
  const registry = auditStore.getGuildRegistry?.() || [];
  let restored = 0;

  for (const guildId of Object.keys(configuredGuilds)) {
    if (!guildId || String(guildId) === commandCenterGuildId) continue;
    const liveGuild = client.guilds.cache.get(String(guildId)) || null;
    const registryGuild = registry.find((entry) => String(entry?.guildId || '') === String(guildId)) || null;
    const sourceGuild = liveGuild || (registryGuild ? { id: String(guildId), name: registryGuild.name || String(guildId) } : null);
    if (!sourceGuild) {
      terminal.warn(`Audit report feed restore skipped for unavailable guild ${guildId}.`);
      continue;
    }

    try {
      const result = await auditRouter.ensureReportRoutes(client, sourceGuild);
      if (result) restored += 1;
    } catch (error) {
      terminal.error(`Failed to restore Audit Intelligence report feeds for ${sourceGuild.name || guildId}: ${error?.message || error}`);
    }
  }

  if (restored > 0) terminal.info(`Audit Intelligence report feeds restored for ${restored} configured guild(s).`);
  return restored;
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    terminal.success(`Logged in as ${client.user?.tag || 'Unknown bot'}`);

    const devGuildIds = getEnvList('DEV_GUILD_IDS');
    const betaGuildIds = getEnvList('BETA_GUILD_IDS');
    const prodGuildIds = getEnvList('PRODUCTION_GUILD_IDS');

    terminal.info(`Guilds cached: ${client.guilds.cache.size}`);

    if (client.botMode === 'DEV' && devGuildIds.length) {
      terminal.info(`DEV guild scope: ${devGuildIds.join(', ')}`);
    }

    if (client.botMode === 'BETA' && betaGuildIds.length) {
      terminal.info(`BETA guild scope: ${betaGuildIds.join(', ')}`);
    }

    if (client.botMode === 'PRODUCTION' && prodGuildIds.length) {
      terminal.info(`PRODUCTION guild scope: ${prodGuildIds.join(', ')}`);
    }

    publishAuditGuildRegistry(client);
    client.on(Events.GuildCreate, () => publishAuditGuildRegistry(client, 'guild joined'));
    client.on(Events.GuildDelete, () => publishAuditGuildRegistry(client, 'guild left'));
    await restoreAuditReportFeeds(client);

    restoreLockdownReminders(client);
    startbackupWorker(client);
    startStatusRotation(client);

    try {
      const voiceSessions = levelingTracking.bootstrapVoiceSessions(client);
      if (voiceSessions > 0) terminal.info(`Leveling voice XP sessions resumed: ${voiceSessions}`);
    } catch (error) {
      terminal.error(`Failed to resume Leveling voice XP sessions: ${error?.message || error}`);
    }
  },
};
