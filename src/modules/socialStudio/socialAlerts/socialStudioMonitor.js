'use strict';

const guildManager = require('../../../core/guild/guildManager');
const sentinelScheduler = require('../../../owner/sentinel/schedulerRegistry.js');
const core = require('./socialStudioMonitorCore');
const { projectEffectiveAccounts } = require('./socialStudioRoutingResolver');

let timer = null;
let schedulerTickMs = 60_000;
const GLOBAL_SCHEDULER = 'social:monitor:global';

function projectLiveRefreshState(account) {
  if (!account || typeof account !== 'object') return account;
  const state = account.state && typeof account.state === 'object' ? account.state : null;
  if (!state) return account;

  const raw = state.lastLiveMessageUpdateAt || state.lastLiveMessageUpdatedAt;
  if (!raw || typeof raw !== 'string') return account;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return account;

  // MonitorCore historically calls Number() on this value, while persisted
  // runtime state stores it as an ISO timestamp. A Date preserves both
  // behaviours: Number(Date) is epoch milliseconds and JSON.stringify(Date)
  // writes the original ISO-compatible representation back to runtime.
  return {
    ...account,
    state: {
      ...state,
      ...(state.lastLiveMessageUpdateAt === raw ? { lastLiveMessageUpdateAt: new Date(parsed) } : {}),
      ...(state.lastLiveMessageUpdatedAt === raw ? { lastLiveMessageUpdatedAt: new Date(parsed) } : {}),
    },
  };
}

function projectGuildConfig(guildConfig) {
  if (!guildConfig || typeof guildConfig !== 'object') return guildConfig;
  const modules = guildConfig.modules && typeof guildConfig.modules === 'object' ? guildConfig.modules : {};
  const social = modules.social && typeof modules.social === 'object' ? modules.social : null;
  if (!social) return guildConfig;
  const effectiveAccounts = projectEffectiveAccounts(social);
  const projectedAccounts = Object.fromEntries(
    Object.entries(effectiveAccounts && typeof effectiveAccounts === 'object' ? effectiveAccounts : {})
      .map(([accountId, account]) => [accountId, projectLiveRefreshState(account)])
  );
  const projectedSocial = {
    ...social,
    accounts: projectedAccounts,
  };
  return {
    ...guildConfig,
    modules: {
      ...modules,
      social: projectedSocial,
    },
  };
}

function projectedOptions(guildId, options = {}) {
  const sourceGuildConfig = options.guildConfig && typeof options.guildConfig === 'object'
    ? options.guildConfig
    : guildManager.reloadGuild(guildId);
  return {
    ...options,
    guildConfig: projectGuildConfig(sourceGuildConfig),
  };
}

function checkGuildAccounts(client, guildId, options = {}) {
  return core.checkGuildAccounts(client, guildId, projectedOptions(guildId, options));
}

function forcePostCreatorLive(client, guildId, creatorId, options = {}) {
  return core.forcePostCreatorLive(client, guildId, creatorId, projectedOptions(guildId, options));
}

function guildScheduler(guild) {
  return sentinelScheduler.register({
    module: 'social',
    component: 'automatic-monitor',
    guildId: guild.id,
    guildName: guild.name,
    intervalMs: schedulerTickMs,
    staleAfterMs: Math.max(schedulerTickMs * 3, 180_000),
  });
}

async function sweep(client) {
  let checked = 0;
  let failed = 0;
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    const schedulerId = guildScheduler(guild);
    try {
      await checkGuildAccounts(client, guild.id);
      checked += 1;
      sentinelScheduler.beat(schedulerId, { guildsChecked: checked, lastSweepGuildId: guild.id });
    } catch (error) {
      failed += 1;
      sentinelScheduler.fail(schedulerId, error, { guildId: guild.id });
      console.error(`[Social Studio] automatic check failed for guild ${guild.id}:`, error?.message || error);
    }
  }
  sentinelScheduler.beat(GLOBAL_SCHEDULER, { guildsChecked: checked, guildFailures: failed });
  return { checked, failed };
}

function runSweep(client, label) {
  return sweep(client).catch((error) => {
    sentinelScheduler.fail(GLOBAL_SCHEDULER, error, { phase: label });
    console.error(`[Social Studio] ${label} sweep failed:`, error);
  });
}

function startupSocialStudio(client) {
  if (timer) return timer;
  schedulerTickMs = Math.max(30000, Number(process.env.SOCIAL_STUDIO_TICK_MS || 60000));
  sentinelScheduler.register({
    id: GLOBAL_SCHEDULER,
    module: 'social',
    component: 'automatic-monitor',
    intervalMs: schedulerTickMs,
    staleAfterMs: Math.max(schedulerTickMs * 3, 180_000),
    details: { scope: 'all-guilds' },
  });
  const initial = setTimeout(() => runSweep(client, 'initial'), 5000);
  initial.unref?.();
  timer = setInterval(() => runSweep(client, 'scheduled'), schedulerTickMs);
  timer.unref?.();
  console.log(`✅ Social Studio monitor started (${schedulerTickMs}ms scheduler tick)`);
  return timer;
}

module.exports = {
  startupSocialStudio,
  checkGuildAccounts,
  forcePostCreatorLive,
};
