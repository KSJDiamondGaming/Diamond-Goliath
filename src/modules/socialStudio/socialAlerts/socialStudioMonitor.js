'use strict';

const guildManager = require('../../../core/guild/guildManager');
const core = require('./socialStudioMonitorCore');
const { projectEffectiveAccounts } = require('./socialStudioRoutingResolver');

let timer = null;

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

async function sweep(client) {
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    try {
      await checkGuildAccounts(client, guild.id);
    } catch (error) {
      console.error(`[Social Studio] automatic check failed for guild ${guild.id}:`, error?.message || error);
    }
  }
}

function startupSocialStudio(client) {
  if (timer) return timer;
  const tickMs = Math.max(30000, Number(process.env.SOCIAL_STUDIO_TICK_MS || 60000));
  const initial = setTimeout(() => sweep(client).catch((error) => console.error('[Social Studio] initial sweep failed:', error)), 5000);
  initial.unref?.();
  timer = setInterval(() => sweep(client).catch((error) => console.error('[Social Studio] sweep failed:', error)), tickMs);
  timer.unref?.();
  console.log(`✅ Social Studio monitor started (${tickMs}ms scheduler tick)`);
  return timer;
}

module.exports = {
  ...core,
  startupSocialStudio,
  checkGuildAccounts,
  forcePostCreatorLive,
};
