'use strict';

// src/modules/social/providerRegistry.js

const twitchProvider = require('./providers/twitchProvider');

const PROVIDER_STATUSES = Object.freeze({
  READY: 'ready',
  NOT_CONFIGURED: 'not_configured',
  NOT_IMPLEMENTED: 'not_implemented',
  ERROR: 'error',
});

const providerDefinitions = Object.freeze({
  twitch: {
    id: 'twitch',
    label: 'Twitch',
    supportedAlertTypes: ['live'],
    status: PROVIDER_STATUSES.READY,
    requiredEnv: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
    handler: twitchProvider,
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    supportedAlertTypes: ['upload', 'short', 'live'],
    status: PROVIDER_STATUSES.NOT_CONFIGURED,
    requiredEnv: ['YOUTUBE_API_KEY'],
  },
  kick: {
    id: 'kick',
    label: 'Kick',
    supportedAlertTypes: ['live'],
    status: PROVIDER_STATUSES.NOT_IMPLEMENTED,
    requiredEnv: [],
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    supportedAlertTypes: ['post', 'live'],
    status: PROVIDER_STATUSES.NOT_IMPLEMENTED,
    requiredEnv: [],
  },
});

function hasRequiredEnv(requiredEnv = []) {
  return requiredEnv.every((name) => Boolean(String(process.env[name] || '').trim()));
}

function getProvider(platform) {
  const provider = providerDefinitions[String(platform || '').toLowerCase()] || null;
  if (!provider) return null;

  if (provider.requiredEnv.length && !hasRequiredEnv(provider.requiredEnv)) {
    return { ...provider, status: PROVIDER_STATUSES.NOT_CONFIGURED };
  }

  return provider;
}

function listProviders() {
  return Object.keys(providerDefinitions)
    .sort((a, b) => providerDefinitions[a].label.localeCompare(providerDefinitions[b].label))
    .map(getProvider);
}

async function checkAccount(account = {}) {
  const provider = getProvider(account.platform);

  if (!provider) {
    return {
      success: false,
      status: PROVIDER_STATUSES.ERROR,
      providerStatus: PROVIDER_STATUSES.ERROR,
      error: `Unsupported social platform: ${account.platform || 'unknown'}`,
    };
  }

  if (provider.handler?.checkAccount && provider.status !== PROVIDER_STATUSES.NOT_CONFIGURED) {
    return provider.handler.checkAccount(account);
  }

  return {
    success: false,
    status: provider.status,
    providerStatus: provider.status,
    platform: provider.id,
    provider: provider.label,
    accountId: account.accountId,
    username: account.username,
    supportedAlertTypes: provider.supportedAlertTypes,
    checkedAt: new Date().toISOString(),
    error: provider.status === PROVIDER_STATUSES.NOT_CONFIGURED
      ? `${provider.label} provider is missing required environment variables.`
      : `${provider.label} provider polling is not implemented yet.`,
  };
}

module.exports = {
  PROVIDER_STATUSES,
  getProvider,
  listProviders,
  checkAccount,
};
