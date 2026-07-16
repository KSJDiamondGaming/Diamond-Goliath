'use strict';

const socialManager = require('./socialManager');
const socialStore = require('./socialStore');
const providerRegistry = require('./providerRegistry');

let intervalRef = null;
let running = false;

function getIntervalMs(options = {}) {
  const value = Number(options.intervalMs || process.env.SOCIAL_CHECK_INTERVAL_MS || 300000);
  return Number.isFinite(value) && value >= 60000 ? value : 300000;
}

function buildProviderMetadata(result = {}) {
  return {
    providerStatus: result.providerStatus || result.status || 'unknown',
    lastCheckedAt: result.checkedAt || new Date().toISOString(),
    lastError: result.success ? '' : result.error || '',
    isLive: result.isLive === true,
    lastTitle: result.title || '',
    lastGameName: result.gameName || '',
    lastViewerCount: Number(result.viewerCount || 0),
  };
}

async function handleProviderResult(guildId, account, result, client) {
  const metadata = buildProviderMetadata(result);
  const updates = {
    externalId: result.externalId || account.externalId,
    metadata: { ...(account.metadata || {}), provider: metadata },
    lastSeen: {
      ...(account.lastSeen || {}),
      lastCheckedAt: metadata.lastCheckedAt,
      lastProviderStatus: metadata.providerStatus,
      lastProviderError: metadata.lastError,
      lastLiveState: metadata.isLive ? 'live' : 'offline',
    },
  };

  socialManager.updateAccount(guildId, account.accountId, updates, { action: 'social_provider_check' });

  if (!result.success) {
    socialStore.incrementAnalytics(guildId, { errors: 1 }, { action: 'social_provider_error' });
    return { success: false, skipped: true, reason: result.error || 'provider_error' };
  }

  if (result.isLive && result.contentId) {
    return socialManager.sendLiveAlert(guildId, { ...account, ...updates }, result, client, { action: 'social_provider_live_alert' });
  }

  return { success: false, skipped: true, reason: 'no_alert' };
}

async function runSocialCheck(client, options = {}) {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;

  try {
    const guildIds = Array.isArray(options.guildIds) && options.guildIds.length
      ? options.guildIds
      : [...(client?.guilds?.cache?.keys?.() || [])];
    const results = [];
    let checkedGuilds = 0;

    for (const guildId of guildIds) {
      const config = socialManager.getConfig(guildId);
      if (config.enabled === false) continue;
      checkedGuilds += 1;

      const accounts = (config.accounts || []).filter((account) => {
        if (account.enabled === false) return false;
        return config.providers?.[account.platform]?.enabled !== false;
      });

      for (const account of accounts) {
        try {
          const result = await providerRegistry.checkAccount(account);
          const alertResult = await handleProviderResult(guildId, account, result, client);
          results.push({ guildId, accountId: account.accountId, ...result, alertResult });
        } catch (error) {
          socialStore.incrementAnalytics(guildId, { errors: 1 }, { action: 'social_scheduler_exception' });
          socialManager.updateAccount(guildId, account.accountId, {
            lastSeen: {
              ...(account.lastSeen || {}),
              lastCheckedAt: new Date().toISOString(),
              lastProviderStatus: 'error',
              lastProviderError: error.message,
            },
          }, { action: 'social_scheduler_exception' });
          results.push({ guildId, accountId: account.accountId, success: false, error: error.message });
        }
      }
    }

    return { skipped: false, guildCount: checkedGuilds, accountCount: results.length, results };
  } finally {
    running = false;
  }
}

function startSocialScheduler(client, options = {}) {
  if (intervalRef) return intervalRef;
  const intervalMs = getIntervalMs(options);
  intervalRef = setInterval(() => {
    runSocialCheck(client, options).catch((error) => console.error('[SocialScheduler] Check failed:', error));
  }, intervalMs);
  if (typeof intervalRef.unref === 'function') intervalRef.unref();
  console.log(`[SocialScheduler] Social provider scheduler ready (${intervalMs}ms)`);
  return intervalRef;
}

function stopSocialScheduler() {
  if (!intervalRef) return false;
  clearInterval(intervalRef);
  intervalRef = null;
  return true;
}

module.exports = { runSocialCheck, startSocialScheduler, stopSocialScheduler };
