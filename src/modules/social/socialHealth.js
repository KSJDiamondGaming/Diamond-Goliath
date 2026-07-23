'use strict';

const social = require('./social');
const socialStore = require('./socialStore');

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

async function resolveMessage(guild, channelId, messageId) {
  if (!channelId || !messageId) return null;
  const channel = await resolveChannel(guild, channelId);
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

function routedChannelIds(account = {}) {
  const routing = account.metadata?.routing && typeof account.metadata.routing === 'object' ? account.metadata.routing : {};
  const entries = [
    ['default', account.alertChannelId],
    ['live', routing.live || routing.liveChannelId],
    ['upload', routing.upload || routing.uploadChannelId],
    ['short', routing.short || routing.shortChannelId],
    ['post', routing.post || routing.postChannelId],
  ];
  const seen = new Set();
  return entries.filter(([, id]) => id && !seen.has(id) && seen.add(id));
}

function validClock(value) {
  if (value === undefined || value === null || value === '') return true;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value));
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

function settingsSummary(settings = {}) {
  return {
    checkIntervalMs: Number(settings.checkIntervalMs || 0),
    retryIntervalMs: Number(settings.retryIntervalMs || 0),
    retryDeliveries: settings.retryDeliveries !== false,
    maxDeliveryAttempts: Number(settings.maxDeliveryAttempts || 0),
    cooldownMs: Number(settings.cooldownMs || 0),
    suppressDuplicates: settings.suppressDuplicates !== false,
    editLiveNotifications: settings.editLiveNotifications === true,
    deleteEndedNotifications: settings.deleteEndedNotifications === true,
    includeViewerCount: settings.includeViewerCount !== false,
    includeLiveDuration: settings.includeLiveDuration !== false,
    thumbnailPreference: settings.thumbnailPreference || 'stream',
    platformPriority: Array.isArray(settings.platformPriority) ? settings.platformPriority : [],
  };
}

async function buildHealth(guild) {
  if (!guild) throw new Error('Guild is required.');
  const config = social.getConfig(guild.id);
  const settings = config.settings || {};
  const issues = [];
  const providers = social.providers.listProviders();
  const queue = social.queue.list(guild.id);
  const diagnostics = social.diagnostics.buildDiagnostics(guild.id);
  const scheduler = social.scheduler.getSchedulerStatus();
  const providerHealth = social.providerHealth.summary();

  if (Number(settings.checkIntervalMs) < 60000) issues.push({ code: 'poll_interval_too_low', severity: 'error', value: settings.checkIntervalMs });
  if (settings.retryDeliveries !== false && Number(settings.retryIntervalMs) < 10000) issues.push({ code: 'retry_interval_too_low', severity: 'error', value: settings.retryIntervalMs });
  if (settings.retryDeliveries !== false && Number(settings.maxDeliveryAttempts) < 1) issues.push({ code: 'retry_attempts_invalid', severity: 'error', value: settings.maxDeliveryAttempts });
  if (settings.deleteEndedNotifications === true && settings.editLiveNotifications !== true) {
    issues.push({ code: 'ended_delete_without_live_editing', severity: 'warning' });
  }
  if (!scheduler.started) issues.push({ code: 'scheduler_not_started', severity: 'warning' });
  if (scheduler.lastRun?.timeoutCount > 0) {
    issues.push({ code: 'provider_timeouts_detected', severity: 'warning', count: scheduler.lastRun.timeoutCount, completedAt: scheduler.lastRun.completedAt });
  }
  for (const health of Object.values(providerHealth.providers)) {
    if (health.state === 'open') {
      issues.push({
        code: 'provider_circuit_open',
        severity: 'warning',
        platform: health.provider,
        retryAt: health.openUntil,
        remainingMs: health.remainingOpenMs,
        failureType: health.lastFailureType,
        error: health.lastError,
      });
    } else if (health.state === 'half_open') {
      issues.push({
        code: 'provider_recovery_probe_pending',
        severity: 'warning',
        platform: health.provider,
        failureType: health.lastFailureType,
      });
    }
  }

  const configuredPriority = Array.isArray(settings.platformPriority) ? settings.platformPriority : [];
  const missingPriority = providers.map((provider) => provider.id).filter((id) => !configuredPriority.includes(id));
  if (missingPriority.length) issues.push({ code: 'platform_priority_incomplete', severity: 'warning', platforms: missingPriority });

  for (const account of config.accounts || []) {
    if (account.enabled === false) continue;
    const provider = providers.find((item) => item.id === account.platform);
    if (!provider) issues.push({ code: 'provider_unknown', severity: 'error', accountId: account.accountId, platform: account.platform });
    else if (provider.status !== 'ready') issues.push({ code: `provider_${provider.status}`, severity: 'warning', accountId: account.accountId, platform: account.platform });

    const routes = routedChannelIds(account);
    if (!routes.length) issues.push({ code: 'alert_channel_missing', severity: 'error', accountId: account.accountId, channelId: null });
    for (const [alertType, channelId] of routes) {
      const channel = await resolveChannel(guild, channelId);
      if (!channel?.send) issues.push({ code: 'routed_channel_missing', severity: 'error', accountId: account.accountId, alertType, channelId });
    }

    if (!account.username && !account.externalId) issues.push({ code: 'account_identifier_missing', severity: 'error', accountId: account.accountId });
    if (account.lastSeen?.lastProviderError) issues.push({ code: 'provider_last_error', severity: 'warning', accountId: account.accountId, error: account.lastSeen.lastProviderError });
    if (account.lastSeen?.lastProviderTimedOut === true) {
      issues.push({
        code: 'provider_last_check_timed_out',
        severity: 'warning',
        accountId: account.accountId,
        platform: account.platform,
        responseTimeMs: Number(account.lastSeen?.lastProviderResponseTimeMs || 0),
      });
    }

    const hasStoredMessage = Boolean(account.lastSeen?.lastChannelId || account.lastSeen?.lastMessageId);
    const hasCompleteStoredMessage = Boolean(account.lastSeen?.lastChannelId && account.lastSeen?.lastMessageId);
    if (hasStoredMessage && !hasCompleteStoredMessage) {
      issues.push({ code: 'live_message_reference_incomplete', severity: 'warning', accountId: account.accountId });
    } else if (hasCompleteStoredMessage && (settings.editLiveNotifications === true || account.lastSeen?.lastLiveState === 'live')) {
      const message = await resolveMessage(guild, account.lastSeen.lastChannelId, account.lastSeen.lastMessageId);
      if (!message) {
        issues.push({
          code: 'live_message_missing', severity: 'warning', accountId: account.accountId,
          channelId: account.lastSeen.lastChannelId, messageId: account.lastSeen.lastMessageId,
        });
      }
    }

    if (account.lastSeen?.lastLiveState === 'live' && !account.lastSeen?.lastContentId) {
      issues.push({ code: 'live_state_missing_content_id', severity: 'warning', accountId: account.accountId });
    }
  }

  const quiet = settings.quietHours || {};
  if (quiet.enabled === true) {
    if (!validClock(quiet.start) || !validClock(quiet.end)) issues.push({ code: 'quiet_hours_invalid', severity: 'error', start: quiet.start, end: quiet.end });
    if (quiet.timezone || quiet.timeZone) {
      const timezone = quiet.timezone || quiet.timeZone;
      try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date()); }
      catch { issues.push({ code: 'quiet_timezone_invalid', severity: 'error', timezone }); }
    }
  }

  for (const item of queue.filter((entry) => entry.status === 'failed')) {
    issues.push({ code: 'delivery_retry_exhausted', severity: 'warning', queueId: item.id, accountId: item.accountId, error: item.lastError });
  }

  for (const profile of diagnostics.profiles.filter((item) => item.accountCount === 0)) {
    issues.push({ code: 'creator_profile_empty', severity: 'warning', creatorId: profile.creatorId });
  }

  return {
    module: 'social',
    guildId: guild.id,
    healthy: issues.every((issue) => issue.severity !== 'error'),
    score: diagnostics.score,
    grade: diagnostics.grade,
    checkedAt: new Date().toISOString(),
    enabled: config.enabled !== false,
    accountCount: config.accounts.length,
    enabledAccountCount: config.accounts.filter((account) => account.enabled !== false).length,
    creatorProfileCount: diagnostics.profiles.length,
    providers: diagnostics.providers,
    providerHealth,
    accounts: diagnostics.accounts,
    creatorProfiles: diagnostics.profiles,
    queue: social.queue.summary(guild.id),
    scheduler,
    settings: settingsSummary(settings),
    quietHours: {
      enabled: quiet.enabled === true,
      start: quiet.start || '00:00',
      end: quiet.end || '08:00',
      timezone: quiet.timezone || quiet.timeZone || 'UTC',
    },
    issues,
  };
}

async function repair(guild, meta = {}) {
  if (!guild) throw new Error('Guild is required.');
  const config = social.getConfig(guild.id);
  const repaired = [];
  const failed = [];

  for (const account of config.accounts || []) {
    if (account.enabled === false) continue;
    try {
      const result = await social.providers.checkAccount(account);
      const lastSeen = {
        ...(account.lastSeen || {}),
        lastCheckedAt: result.checkedAt || new Date().toISOString(),
        lastProviderStatus: result.providerStatus || result.status || 'unknown',
        lastProviderError: result.success ? '' : result.error || '',
        lastProviderResponseTimeMs: Number(result.responseTimeMs || 0),
        lastProviderTimedOut: result.timedOut === true,
        lastLiveState: result.isLive ? 'live' : 'offline',
      };

      if (account.lastSeen?.lastChannelId && account.lastSeen?.lastMessageId) {
        const message = await resolveMessage(guild, account.lastSeen.lastChannelId, account.lastSeen.lastMessageId);
        if (!message) {
          lastSeen.lastChannelId = null;
          lastSeen.lastMessageId = null;
          lastSeen.lastLiveMessageSnapshot = null;
        }
      } else if (account.lastSeen?.lastChannelId || account.lastSeen?.lastMessageId) {
        lastSeen.lastChannelId = null;
        lastSeen.lastMessageId = null;
        lastSeen.lastLiveMessageSnapshot = null;
      }

      social.updateAccount(guild.id, account.accountId, {
        externalId: result.externalId || account.externalId,
        metadata: {
          ...(account.metadata || {}),
          provider: {
            providerStatus: result.providerStatus || result.status || 'unknown',
            lastCheckedAt: result.checkedAt || new Date().toISOString(),
            lastError: result.success ? '' : result.error || '',
            isLive: result.isLive === true,
            responseTimeMs: Number(result.responseTimeMs || 0),
            timedOut: result.timedOut === true,
            timeoutMs: Number(result.timeoutMs || 0),
          },
        },
        lastSeen,
      }, { action: 'social_repair_check', ...meta });
      repaired.push({ accountId: account.accountId, providerStatus: result.providerStatus || result.status || 'unknown', timedOut: result.timedOut === true });
    } catch (error) {
      socialStore.incrementAnalytics(guild.id, { errors: 1 }, { action: 'social_repair_error', ...meta });
      failed.push({ accountId: account.accountId, error: error.message });
    }
  }

  for (const item of social.queue.list(guild.id, { status: 'failed' })) {
    social.queue.retryNow(guild.id, item.id, { action: 'social_repair_queue_retry', ...meta });
  }
  const queueResult = await social.queue.processGuild(guild.id, guild.client, { meta: { action: 'social_repair_queue_process', ...meta } });

  return { repaired, failed, queue: queueResult, health: await buildHealth(guild) };
}

function exportConfig(guildId) {
  return {
    module: 'social',
    guildId: String(guildId),
    exportedAt: new Date().toISOString(),
    config: socialStore.getSocialSection(guildId),
    diagnostics: social.diagnostics.buildDiagnostics(guildId),
    scheduler: social.scheduler.getSchedulerStatus(),
    providerHealth: social.providerHealth.summary(),
    http: social.http.summary(),
    queue: social.queue.list(guildId),
    history: social.history.list(guildId, { limit: social.history.MAX_HISTORY }),
  };
}

function reset(guildId, meta = {}) {
  social.queue.clear(guildId, { action: 'social_reset_queue', ...meta });
  return socialStore.saveSocialSection(guildId, socialStore.defaultSocialSection(), { action: 'social_reset', ...meta });
}

module.exports = { buildHealth, repair, exportConfig, reset };