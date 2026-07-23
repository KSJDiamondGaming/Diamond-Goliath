'use strict';

const socialManager = require('./socialManager');
const socialDelivery = require('./socialDelivery');
const socialLifecycle = require('./socialLifecycle');
const socialStore = require('./socialStore');
const socialHistory = require('./socialHistory');
const providerRegistry = require('./providerRegistry');

const MIN_INTERVAL_MS = 60000;
const DEFAULT_INTERVAL_MS = 300000;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 20;
let intervalRef = null;
let running = false;
let schedulerClient = null;
let lastRun = null;

function normalizeIntervalMs(value, fallback = DEFAULT_INTERVAL_MS) {
  const intervalMs = Number(value);
  return Number.isFinite(intervalMs) && intervalMs >= MIN_INTERVAL_MS ? intervalMs : fallback;
}

function normalizeConcurrency(value = process.env.SOCIAL_PROVIDER_CONCURRENCY) {
  const concurrency = Number(value);
  if (!Number.isFinite(concurrency)) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(1, Math.round(concurrency)));
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
    timedOut: result.timedOut === true,
    timeoutMs: Number(result.timeoutMs || 0),
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
  const sameLiveSession = Boolean(
    result.success && result.isLive === true && result.contentId
    && account.lastSeen?.lastContentId === result.contentId
  );
  const lastSeen = {
    ...(account.lastSeen || {}),
    lastCheckedAt: metadata.lastCheckedAt,
    lastProviderStatus: metadata.providerStatus,
    lastProviderError: metadata.lastError,
    lastProviderResponseTimeMs: metadata.responseTimeMs,
    lastProviderTimedOut: metadata.timedOut,
    lastLiveState: metadata.isLive ? 'live' : 'offline',
  };

  if (metadata.isLive) {
    lastSeen.lastLiveAt = account.lastSeen?.lastLiveState === 'live'
      ? account.lastSeen?.lastLiveAt || metadata.lastCheckedAt
      : metadata.lastCheckedAt;
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
  const currentAccount = { ...account, ...updates };

  if (!result.success) {
    socialStore.incrementAnalytics(guildId, { errors: 1 }, { action: 'social_provider_error' });
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'failed', eventType: 'provider_check',
      error: result.error || 'Provider check failed.',
      metadata: {
        responseTimeMs: metadata.responseTimeMs,
        timedOut: metadata.timedOut,
        timeoutMs: metadata.timeoutMs || null,
      },
    });
    return { success: false, skipped: true, reason: result.error || 'provider_error' };
  }

  if (streamEnded) {
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'ended', eventType: 'stream_ended',
      metadata: { lastLiveAt: account.lastSeen?.lastLiveAt || null, endedAt: metadata.lastCheckedAt },
    });
    const lifecycleResult = await socialLifecycle.finalizeLiveMessage(guildId, currentAccount, client, {
      action: 'social_stream_ended_lifecycle',
    });
    return {
      success: lifecycleResult.success === true,
      skipped: lifecycleResult.skipped === true,
      reason: lifecycleResult.reason || 'stream_ended',
      lifecycleResult,
    };
  }

  if (firstContent) {
    socialHistory.record(guildId, {
      ...historyBase(account, result), status: 'suppressed', eventType: 'provider_baseline',
      reason: 'initial_content_baseline',
    });
    return { success: false, skipped: true, reason: 'initial_content_baseline' };
  }

  if (sameLiveSession) {
    const lifecycleResult = await socialLifecycle.syncLiveMessage(guildId, currentAccount, result, client, {
      action: 'social_live_metadata_sync',
    });
    return {
      success: lifecycleResult.success === true,
      skipped: lifecycleResult.skipped === true,
      reason: lifecycleResult.reason || (lifecycleResult.success ? 'live_message_edited' : 'current_live_session'),
      lifecycleResult,
    };
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
    return socialDelivery.deliver(guildId, currentAccount, result, client, {
      action: 'social_provider_content_alert',
    });
  }

  socialHistory.record(guildId, {
    ...historyBase(account, result), status: 'skipped', eventType: 'provider_check',
    reason: 'no_new_alert',
  });
  return { success: false, skipped: true, reason: 'no_alert' };
}

async function checkOneAccount(guildId, account, client, options = {}) {
  try {
    const result = await providerRegistry.checkAccount(account, { timeoutMs: options.providerTimeoutMs });
    const alertResult = await handleProviderResult(guildId, account, result, client);
    return { guildId, accountId: account.accountId, ...result, alertResult };
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
    return { guildId, accountId: account.accountId, success: false, error: error.message };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runSocialCheck(client, options = {}) {
  if (running) return { skipped: true, reason: 'already_running', lastRun };
  running = true;
  const startedAt = new Date();
  const concurrency = normalizeConcurrency(options.concurrency);
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
      const guildResults = await mapWithConcurrency(
        accounts,
        concurrency,
        (account) => checkOneAccount(guildId, account, client, options)
      );
      results.push(...guildResults);
    }

    const completedAt = new Date();
    lastRun = {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      guildCount: checkedGuilds,
      deferredGuildCount: deferredGuilds,
      accountCount: results.length,
      successCount: results.filter((result) => result.success === true).length,
      failureCount: results.filter((result) => result.success === false).length,
      timeoutCount: results.filter((result) => result.timedOut === true).length,
      concurrency,
    };

    return {
      skipped: false,
      ...lastRun,
      results,
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
  console.log(`[SocialScheduler] Social provider scheduler ready (${tickIntervalMs}ms tick, concurrency ${normalizeConcurrency(options.concurrency)})`);
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

function getSchedulerStatus() {
  return {
    running,
    started: Boolean(intervalRef),
    concurrency: normalizeConcurrency(),
    providerTimeoutMs: providerRegistry.normalizeTimeoutMs(),
    lastRun,
  };
}

module.exports = {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  normalizeConcurrency,
  runSocialCheck,
  startSocialScheduler,
  stopSocialScheduler,
  getSchedulerStatus,
  handleProviderResult,
};