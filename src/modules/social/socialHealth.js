'use strict';

const social = require('./social');

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

async function buildHealth(guild) {
  if (!guild) throw new Error('Guild is required.');
  const config = social.getConfig(guild.id);
  const issues = [];
  const providers = social.providers.listProviders();

  for (const account of config.accounts || []) {
    if (account.enabled === false) continue;
    const provider = providers.find((item) => item.id === account.platform);
    if (!provider) issues.push({ code: 'provider_unknown', severity: 'error', accountId: account.accountId, platform: account.platform });
    else if (provider.status !== 'ready') issues.push({ code: `provider_${provider.status}`, severity: 'warning', accountId: account.accountId, platform: account.platform });

    const channel = await resolveChannel(guild, account.alertChannelId);
    if (!channel?.send) issues.push({ code: 'alert_channel_missing', severity: 'error', accountId: account.accountId, channelId: account.alertChannelId || null });
    if (!account.username && !account.externalId) issues.push({ code: 'account_identifier_missing', severity: 'error', accountId: account.accountId });
    if (account.lastSeen?.lastProviderError) issues.push({ code: 'provider_last_error', severity: 'warning', accountId: account.accountId, error: account.lastSeen.lastProviderError });
  }

  return {
    module: 'social',
    guildId: guild.id,
    healthy: issues.every((issue) => issue.severity !== 'error'),
    checkedAt: new Date().toISOString(),
    enabled: config.enabled !== false,
    accountCount: config.accounts.length,
    enabledAccountCount: config.accounts.filter((account) => account.enabled !== false).length,
    providers,
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
      social.updateAccount(guild.id, account.accountId, {
        externalId: result.externalId || account.externalId,
        metadata: {
          ...(account.metadata || {}),
          provider: {
            providerStatus: result.providerStatus || result.status || 'unknown',
            lastCheckedAt: result.checkedAt || new Date().toISOString(),
            lastError: result.success ? '' : result.error || '',
            isLive: result.isLive === true,
          },
        },
        lastSeen: {
          ...(account.lastSeen || {}),
          lastCheckedAt: result.checkedAt || new Date().toISOString(),
          lastProviderStatus: result.providerStatus || result.status || 'unknown',
          lastProviderError: result.success ? '' : result.error || '',
          lastLiveState: result.isLive ? 'live' : 'offline',
        },
      }, { action: 'social_repair_check', ...meta });
      repaired.push({ accountId: account.accountId, providerStatus: result.providerStatus || result.status || 'unknown' });
    } catch (error) {
      social.store.incrementAnalytics(guild.id, { errors: 1 }, { action: 'social_repair_error', ...meta });
      failed.push({ accountId: account.accountId, error: error.message });
    }
  }

  return { repaired, failed, health: await buildHealth(guild) };
}

function exportConfig(guildId) {
  return {
    module: 'social',
    guildId: String(guildId),
    exportedAt: new Date().toISOString(),
    config: social.store.getSocialSection(guildId),
  };
}

function reset(guildId, meta = {}) {
  return social.store.saveSocialSection(guildId, social.store.defaultSocialSection(), { action: 'social_reset', ...meta });
}

module.exports = { buildHealth, repair, exportConfig, reset };
