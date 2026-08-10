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

const AUDIT_REGISTRY_REFRESH_MS = 5 * 60 * 1000;
const AUDIT_LIVE_PROBE_POLL_MS = 1000;
const auditLiveProbeInFlight = new Set();

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

async function refreshAuditGuildRegistry(client, reason = 'startup') {
  try {
    await client.guilds.fetch();
  } catch (error) {
    terminal.warn(`Audit guild registry cache refresh failed (${reason}): ${error?.message || error}`);
  }
  return publishAuditGuildRegistry(client, reason);
}

function startAuditGuildRegistryRefresh(client) {
  const timer = setInterval(() => {
    refreshAuditGuildRegistry(client, 'scheduled refresh').catch((error) => {
      terminal.error(`Audit guild registry scheduled refresh failed: ${error?.message || error}`);
    });
  }, AUDIT_REGISTRY_REFRESH_MS);
  timer.unref?.();
}

function liveProbeExpired(request, now = Date.now()) {
  const expiresAt = Date.parse(request?.expiresAt || '') || 0;
  return Boolean(expiresAt && expiresAt <= now);
}

function liveProbeStillPending(requestId, mode) {
  const current = auditStore.getLiveProbeRequest?.(requestId);
  if (!current || current.status !== 'pending') return null;
  if (String(current.targetMode || '').toUpperCase() !== String(mode || '').toUpperCase()) return null;
  if (liveProbeExpired(current)) return null;
  return current;
}

async function processAuditLiveProbeRequests(client) {
  const mode = auditStore.runtimeMode?.() || String(client?.botMode || process.env.BOT_MODE || 'DEV').toUpperCase();
  const requests = auditStore.getPendingLiveProbeRequests?.(mode) || [];
  if (!requests.length) return 0;
  let processed = 0;

  for (const request of requests) {
    const requestId = String(request?.id || '');
    if (!requestId || auditLiveProbeInFlight.has(requestId)) continue;

    const current = liveProbeStillPending(requestId, mode);
    if (!current) continue;

    auditLiveProbeInFlight.add(requestId);
    const startedAt = Date.now();
    try {
      const guildId = String(current.guildId || '');
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);

      if (!liveProbeStillPending(requestId, mode)) {
        terminal.warn(`Audit live probe request ${requestId} became stale before execution in ${mode}; skipping.`);
        continue;
      }

      const result = guild
        ? await auditRouter.runLocalEndToEndProbe(client, guild)
        : { started: false, reason: 'registry-only' };

      const fresh = auditStore.getLiveProbeRequest?.(requestId);
      if (fresh?.status === 'pending' && String(fresh.targetMode || '').toUpperCase() === mode) {
        auditStore.completeLiveProbeRequest?.(requestId, result, mode);
      }

      processed += 1;
      const durationMs = Date.now() - startedAt;
      terminal.info(`Audit live probe request ${requestId} completed by ${mode} for guild ${guildId} in ${durationMs}ms: ${result.started ? 'started' : result.reason || 'not-started'}${current.requestedFrom ? ` (requested from ${current.requestedFrom})` : ''}`);
    } catch (error) {
      const fresh = auditStore.getLiveProbeRequest?.(requestId);
      if (fresh?.status === 'pending' && String(fresh.targetMode || '').toUpperCase() === mode) {
        auditStore.completeLiveProbeRequest?.(requestId, { started: false, reason: 'create-failed' }, mode);
      }
      terminal.error(`Audit live probe request ${requestId} failed in ${mode} after ${Date.now() - startedAt}ms: ${error?.message || error}`);
    } finally {
      auditLiveProbeInFlight.delete(requestId);
    }
  }
  return processed;
}

function startAuditLiveProbeProcessor(client) {
  processAuditLiveProbeRequests(client).catch((error) => terminal.error(`Audit live probe startup processing failed: ${error?.message || error}`));
  const timer = setInterval(() => {
    processAuditLiveProbeRequests(client).catch((error) => terminal.error(`Audit live probe processing failed: ${error?.message || error}`));
  }, AUDIT_LIVE_PROBE_POLL_MS);
  timer.unref?.();
}

async function restoreAuditReportFeeds(client) {
  const mode = String(client?.botMode || process.env.BOT_MODE || 'DEV').trim().toUpperCase();
  const result = { mode, total: 0, restored: 0, failed: 0, unavailable: 0 };
  if (mode !== 'DEV') return result;

  const config = auditStore.getConfig();
  if (config.autoProvision === false || !config.commandCenter?.guildId) return result;

  const configuredGuilds = config.guilds && typeof config.guilds === 'object' ? config.guilds : {};
  const commandCenterGuildId = String(config.commandCenter.guildId);
  const registry = auditStore.getGuildRegistry?.() || [];

  for (const guildId of Object.keys(configuredGuilds)) {
    if (!guildId || String(guildId) === commandCenterGuildId) continue;
    result.total += 1;
    const liveGuild = client.guilds.cache.get(String(guildId)) || null;
    const registryGuild = registry.find((entry) => String(entry?.guildId || '') === String(guildId)) || null;
    const sourceGuild = liveGuild || (registryGuild ? { id: String(guildId), name: registryGuild.name || String(guildId) } : null);
    if (!sourceGuild) {
      result.unavailable += 1;
      terminal.warn(`Audit report feed restore skipped for unavailable guild ${guildId}.`);
      continue;
    }

    try {
      const restored = await auditRouter.ensureReportRoutes(client, sourceGuild);
      if (restored) result.restored += 1;
      else result.failed += 1;
    } catch (error) {
      result.failed += 1;
      terminal.error(`Failed to restore Audit Intelligence report feeds for ${sourceGuild.name || guildId}: ${error?.message || error}`);
    }
  }

  if (result.restored > 0) terminal.info(`Audit Intelligence report feeds restored for ${result.restored} configured guild(s).`);
  return result;
}

async function sendAuditStartupSummary(client, restoreResult) {
  if (!restoreResult || restoreResult.mode !== 'DEV' || restoreResult.total < 1) return false;
  try {
    const context = await auditRouter.ensureCommandCenter(client);
    if (!context?.channel?.isTextBased?.()) return false;
    const healthy = restoreResult.failed === 0 && restoreResult.unavailable === 0;
    const content = [
      `${healthy ? '🟢' : '🟠'} **Goliath Audit Intelligence Online**`,
      '',
      `**Report feeds checked:** ${restoreResult.total}`,
      `**Restored / ready:** ${restoreResult.restored}`,
      `**Failed:** ${restoreResult.failed}`,
      `**Source guilds unavailable:** ${restoreResult.unavailable}`,
      '',
      healthy
        ? 'Live reporting is ready. Use **Routing → Send Test Report** to verify any individual feed.'
        : 'One or more feeds need attention. Use **Routing → Create / Repair Report Channels** and **Send Test Report** to verify them.',
    ].join('\n');
    await context.channel.send({ content, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    terminal.error(`Failed to send Audit Intelligence startup summary: ${error?.message || error}`);
    return false;
  }
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

    await refreshAuditGuildRegistry(client);
    client.on(Events.GuildCreate, () => refreshAuditGuildRegistry(client, 'guild joined'));
    client.on(Events.GuildDelete, () => refreshAuditGuildRegistry(client, 'guild left'));
    startAuditGuildRegistryRefresh(client);
    startAuditLiveProbeProcessor(client);

    const auditRestore = await restoreAuditReportFeeds(client);
    await sendAuditStartupSummary(client, auditRestore);

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
