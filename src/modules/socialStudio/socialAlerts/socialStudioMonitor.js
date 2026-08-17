'use strict';

const guildManager = require('../../../core/guild/guildManager');
const sentinelScheduler = require('../../../owner/sentinel/schedulerRegistry.js');
const core = require('./socialStudioMonitorCore');
const { projectEffectiveAccounts } = require('./socialStudioRoutingResolver');

let timer = null;
let schedulerTickMs = 60_000;
const GLOBAL_SCHEDULER = 'social:monitor:global';

function projectGuildConfig(guildConfig) {
  if (!guildConfig || typeof guildConfig !== 'object') return guildConfig;
  const modules = guildConfig.modules && typeof guildConfig.modules === 'object' ? guildConfig.modules : {};
  const social = modules.social && typeof modules.social === 'object' ? modules.social : null;
  if (!social) return guildConfig;
  const projectedSocial = {
    ...social,
    accounts: projectEffectiveAccounts(social),
  };
  return {
    ...guildConfig,
    modules: {
      ...modules,
      social: projectedSocial,
    },
  };
}

function invokeWithProjectedRouting(fn, args) {
  const originalReloadGuild = guildManager.reloadGuild;
  guildManager.reloadGuild = function projectedReloadGuild(...reloadArgs) {
    return projectGuildConfig(originalReloadGuild.apply(guildManager, reloadArgs));
  };
  try {
    // Async functions execute synchronously through their first await. The
    // monitor loads its guild config at the start, so we can restore the
    // shared manager immediately after the invocation without leaking the
    // projection into unrelated runtime consumers.
    return fn(...args);
  } finally {
    guildManager.reloadGuild = originalReloadGuild;
  }
}

function checkGuildAccounts(...args) {
  return invokeWithProjectedRouting(core.checkGuildAccounts, args);
}

function forcePostCreatorLive(...args) {
  return invokeWithProjectedRouting(core.forcePostCreatorLive, args);
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
