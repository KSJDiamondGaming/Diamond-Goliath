'use strict';

const socialManager = require('./socialManager');
const socialDelivery = require('./socialDelivery');
const socialStore = require('./socialStore');
const socialHistory = require('./socialHistory');
const providerRegistry = require('./providerRegistry');

const MIN_INTERVAL_MS = 60000;
const DEFAULT_INTERVAL_MS = 300000;
let intervalRef = null;
let running = false;
let schedulerClient = null;

function normalizeIntervalMs(value, fallback = DEFAULT_INTERVAL_MS) {
  const intervalMs = Number(value);
  return Number.isFinite(intervalMs) && intervalMs >= MIN_INTERVAL_MS ? intervalMs : fallback;
}

function getGuildIntervalMs(config = {}, options = {}) {
  return normalizeIntervalMs(
    config.settings?.checkIntervalMs,
    normalizeIntervalMs(options.intervalMs || process.env.SOCIAL_CHECK_INTERVAL_MS)
  );
}

function getSchedulerTickMs(options = {}) {
  return Math.min(
    normalizeIntervalMs(options.tickIntervalMs || process.env.SOCIAL_SCHEDULER_TICK_MS),
    DEFAULT_INTERVAL_MS
  );
}

function latestAccountCheckAt(accounts = []) {
  return accounts.reduce((latest, account) => {
    const checkedAt = Date.parse(account.lastSeen?.lastCheckedAt || '');
    return Number.isFinite(checkedAt) ? Math.max(latest, checkedAt) : latest;
  }, 0);
}

function isGuildDue(config = {}, accounts = [], options = {}) {
  if (options.force === true || options.respectSchedule !== true) return true;
  const lastCheckedAt = latestAccountCheckAt(accounts);
  return !lastCheckedAt || Date.now() - lastCheckedAt >= getGuildIntervalMs(config, options);
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
    lastThumbnailUrl: result.thumbnailUrl || '',
    responseTimeMs: Number(result.responseTimeMs || 0),
    alertType: result.alertType || null,
    publishedAt: result.publishedAt || null,
  };
}

function historyBase(account, result = {}) {
  return {
    accountId: account.accountId,
    creator: account.displayName || account.username || null,
    platform: account.platform,
    alertType: result.alertType || 'live',
    contentId: result.contentId || null,
    title: result.title || null,
    providerStatus: result.providerStatus || result.status || 'unknown',
  };
}

async function handleProviderResult(guildId, account, result, client) {
  const metadata = buildProviderMetadata(result);
  const previousLiveState = account.lastSeen?.lastLiveState || 'unknown';
  const firstContent = Boolean(result.success && result.contentId && !account.lastSeen?.lastContentId);
  const streamEnded = Boolean(result.success && previousLiveState === 'live' && result.isLive !== true);
  const lastSeen = {
    ...(account.lastSeen || {}),
    lastCheckedAt: metadata.lastCheckedAt,
    lastProviderStatus: metadata.providerStatus,
    lastProviderError: metadata.lastError,
    lastLiveState: metadata.isLive ? 'live' : 'offline',
  };

  if (metadata.isLive) {
    lastSeen.lastLiveAt = metadata.lastCheckedAt;
    lastSeen.lastLiveTitle = metadata.lastTitle;
    lastSeen.lastLiveGameName = metadata.lastGameName;
    lastSeen.lastLiveThumbnailUrl = metadata.lastThumbnailUrl;
  }
  if (streamEnded) lastSeen.lastEndedAt = metadata.lastCheckedAt;
  if (firstContent) {
    lastSeen.lastContentId = result.contentId;
    lastSeen.lastTitle = result.title || '';
  }

  const updates = {
    externalId: result.externalId || account.externalId,
    displayName: result.displayName || account.displayName,
    metadata: { ...(account.metadata || {}), provider: metadata },
    lastSeen,
  };
  socialManager.updateAccount(guildId, account.accountId, updates, { action: 'social_provider_check' });

  if (!result.success) {
    socialStore.incrementAnalytics(guildId, { errors: 1 }, { action: 'social_provider_error' });
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'failed', eventType: 'provider_check',
      error: result.error || 'Provider check failed.',
    });
    return { success: false, skipped: true, reason: result.error || 'provider_error' };
  }

  if (streamEnded) {
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'ended', eventType: 'stream_ended',
      metadata: { lastLiveAt: account.lastSeen?.lastLiveAt || null, endedAt: metadata.lastCheckedAt },
    });
  }

  if (firstContent) {
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'suppressed', eventType: 'provider_baseline',
      reason: 'initial_content_baseline',
    });
    return { success: false, skipped: true, reason: 'initial_content_baseline' };
  }

  if (result.contentId && result.hasAlert !== false && (result.isLive || result.alertType)) {
    const enabledTypes = Array.isArray(account.alertTypes) ? account.alertTypes : ['live'];
    if (!enabledTypes.includes(result.alertType || 'live')) {
      socialHistory.record(guildId, {
        ...historyBase(account, result), status: 'skipped', eventType: 'provider_check',
        reason: 'alert_type_disabled',
      });
      return { success: false, skipped: true, reason: 'alert_type_disabled' };
    }
    return socialDelivery.deliver(guildId, { ...account, ...updates }, result, client, {
      action: 'social_provider_content_alert',
    });
  }

  if (!streamEnded) {
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'skipped', eventType: 'provider_check',
      reason: 'no_new_alert',
    });
  }
  return { success: false, skipped: true, reason: streamEnded ? 'stream_ended' : 'no_alert' };
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
    let deferredGuilds = 0;

    for (const guildId of guildIds) {
      const config = socialManager.getConfig(guildId);
      if (config.enabled === false) continue;
      const accounts = (config.accounts || []).filter(
        (account) => account.enabled !== false && config.providers?.[account.platform]?.enabled !== false
      );
      if (!accounts.length) continue;
      if (!isGuildDue(config, accounts, options)) {
        deferredGuilds += 1;
        continue;
      }

      checkedGuilds += 1;
      for (const account of accounts) {
        try {
          const result = await providerRegistry.checkAccount(account);
          const alertResult = await handleProviderResult(guildId, account, result, client);
          results.push({ guildId, accountId: account.accountId, ...result, alertResult });
        } catch (error) {
          socialStore.incrementAnalytics(guildId, { errors: 1 }, { action: 'social_scheduler_exception' });
          socialManager.updateAccount(guildId, account.accountId, {
            lastSeen: {
              ...(account.lastSeen || {}), lastCheckedAt: new Date().toISOString(),
              lastProviderStatus: 'error', lastProviderError: error.message,
            },
          }, { action: 'social_scheduler_exception' });
          socialHistory.record(guildId, {
            ...historyBase(account, { status: 'error' }), status: 'failed',
            eventType: 'scheduler', error: error.message,
          });
          results.push({ guildId, accountId: account.accountId, success: false, error: error.message });
        }
      }
    }

    return {
      skipped: false, guildCount: checkedGuilds, deferredGuildCount: deferredGuilds,
      accountCount: results.length, results,
    };
  } finally {
    running = false;
  }
}

function startSocialScheduler(client, options = {}) {
  schedulerClient = client || schedulerClient;
  if (intervalRef) return intervalRef;
  const tickIntervalMs = getSchedulerTickMs(options);
  const scheduledOptions = { ...options, respectSchedule: true };
  intervalRef = setInterval(() => {
    runSocialCheck(schedulerClient, scheduledOptions).catch((error) => {
      console.error('[SocialScheduler] Check failed:', error);
    });
  }, tickIntervalMs);
  intervalRef.unref?.();
  console.log(`[SocialScheduler] Social provider scheduler ready (${tickIntervalMs}ms tick)`);
  return intervalRef;
}

function stopSocialScheduler() {
  if (!intervalRef) return false;
  clearInterval(intervalRef);
  intervalRef = null;
  schedulerClient = null;
  console.log('[SocialScheduler] Social provider scheduler stopped');
  return true;
}

module.exports = { runSocialCheck, startSocialScheduler, stopSocialScheduler, handleProviderResult };
