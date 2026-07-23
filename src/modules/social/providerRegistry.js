'use strict';

const twitchProvider = require('./providers/twitchProvider');
const youtubeProvider = require('./providers/youtubeProvider');
const kickProvider = require('./providers/kickProvider');
const tiktokProvider = require('./providers/tiktokProvider');
const instagramProvider = require('./providers/instagramProvider');
const xProvider = require('./providers/xProvider');
const providerHealth = require('./socialProviderHealth');
const providerIncidents = require('./socialProviderIncidents');

const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;
const MIN_PROVIDER_TIMEOUT_MS = 5000;
const MAX_PROVIDER_TIMEOUT_MS = 120000;

const PROVIDER_STATUSES = Object.freeze({
  READY: 'ready',
  NOT_CONFIGURED: 'not_configured',
  NOT_IMPLEMENTED: 'not_implemented',
  AUTHORIZATION_REQUIRED: 'authorization_required',
  CIRCUIT_OPEN: 'circuit_open',
  TIMEOUT: 'timeout',
  ERROR: 'error',
});

const DEFAULT_CAPABILITIES = Object.freeze({
  live: false,
  uploads: false,
  posts: false,
  title: false,
  category: false,
  thumbnail: false,
  viewerCount: false,
  creatorAvatar: false,
  creatorBanner: false,
});

function capabilities(values = {}) {
  return Object.freeze({ ...DEFAULT_CAPABILITIES, ...values });
}

const providerDefinitions = Object.freeze({
  facebook: {
    id: 'facebook', label: 'Facebook Gaming', supportedAlertTypes: ['live'], requiredEnv: [], handler: null,
    zeroCredentialSupported: false,
    unavailableReason: 'Facebook Gaming live monitoring requires Meta app access and authorization for the monitored Page. Enablement depends on the permissions available to the Goliath application.',
    capabilities: capabilities({ live: true, title: true, thumbnail: true, viewerCount: true, creatorAvatar: true, creatorBanner: true }),
  },
  instagram: {
    id: 'instagram', label: 'Instagram', supportedAlertTypes: ['post'], requiredEnv: [], handler: instagramProvider,
    zeroCredentialSupported: false,
    unavailableReason: 'Instagram monitoring requires authorization from the monitored professional account and is outside Social Studio zero-credential scope.',
    capabilities: capabilities({ posts: true, thumbnail: true, creatorAvatar: true }),
  },
  kick: {
    id: 'kick', label: 'Kick', supportedAlertTypes: ['live'], requiredEnv: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'], handler: kickProvider,
    zeroCredentialSupported: true,
    capabilities: capabilities({ live: true, title: true, category: true, thumbnail: true, viewerCount: true, creatorAvatar: true, creatorBanner: true }),
  },
  tiktok: {
    id: 'tiktok', label: 'TikTok', supportedAlertTypes: ['post', 'live'], requiredEnv: [], handler: tiktokProvider,
    zeroCredentialSupported: false,
    unavailableReason: 'TikTok monitored-account access requires creator authorization and depends on the API products approved for the Goliath application.',
    capabilities: capabilities({ live: true, posts: true, title: true, thumbnail: true, viewerCount: true, creatorAvatar: true }),
  },
  twitch: {
    id: 'twitch', label: 'Twitch', supportedAlertTypes: ['live'], requiredEnv: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'], handler: twitchProvider,
    zeroCredentialSupported: true,
    capabilities: capabilities({ live: true, title: true, category: true, thumbnail: true, viewerCount: true, creatorAvatar: true }),
  },
  x: {
    id: 'x', label: 'X', supportedAlertTypes: ['post'], requiredEnv: [], handler: xProvider,
    zeroCredentialSupported: true,
    capabilities: capabilities({ posts: true, thumbnail: true, creatorAvatar: true }),
  },
  youtube: {
    id: 'youtube', label: 'YouTube', supportedAlertTypes: ['upload', 'short', 'live'], requiredEnv: ['YOUTUBE_API_KEY'], handler: youtubeProvider,
    zeroCredentialSupported: true,
    capabilities: capabilities({ live: true, uploads: true, title: true, category: true, thumbnail: true, viewerCount: true, creatorAvatar: true, creatorBanner: true }),
  },
});

function hasRequiredEnv(requiredEnv = []) {
  return requiredEnv.every((name) => Boolean(String(process.env[name] || '').trim()));
}

function normalizeTimeoutMs(value = process.env.SOCIAL_PROVIDER_TIMEOUT_MS) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs)) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.max(MIN_PROVIDER_TIMEOUT_MS, Math.round(timeoutMs)));
}

function getProvider(platform) {
  const provider = providerDefinitions[String(platform || '').toLowerCase()] || null;
  if (!provider) return null;

  let status;
  if (provider.zeroCredentialSupported === false) status = PROVIDER_STATUSES.AUTHORIZATION_REQUIRED;
  else if (typeof provider.handler?.isConfigured === 'function' && !provider.handler.isConfigured()) status = PROVIDER_STATUSES.NOT_CONFIGURED;
  else if (provider.requiredEnv.length && !hasRequiredEnv(provider.requiredEnv)) status = PROVIDER_STATUSES.NOT_CONFIGURED;
  else if (provider.handler?.implemented === true || ['twitch', 'youtube'].includes(provider.handler?.id)) status = PROVIDER_STATUSES.READY;
  else status = PROVIDER_STATUSES.NOT_IMPLEMENTED;

  return {
    ...provider,
    capabilities: { ...DEFAULT_CAPABILITIES, ...(provider.capabilities || {}) },
    status,
    productionSupported: status === PROVIDER_STATUSES.READY,
    technicallyPossible: status !== PROVIDER_STATUSES.NOT_IMPLEMENTED,
    ownerManaged: true,
    userCredentialsRequired: provider.zeroCredentialSupported === false,
    health: providerHealth.snapshot(provider.id),
  };
}

function listProviders() {
  return Object.keys(providerDefinitions)
    .sort((a, b) => providerDefinitions[a].label.localeCompare(providerDefinitions[b].label))
    .map(getProvider);
}

function unavailableResult(provider, account, error) {
  return {
    success: false,
    status: provider.status,
    providerStatus: provider.status,
    platform: provider.id,
    provider: provider.label,
    accountId: account.accountId,
    username: account.username,
    supportedAlertTypes: provider.supportedAlertTypes,
    capabilities: provider.capabilities,
    checkedAt: new Date().toISOString(),
    responseTimeMs: 0,
    error,
  };
}

function timeoutResult(provider, account, timeoutMs, startedAt) {
  return {
    success: false,
    status: PROVIDER_STATUSES.TIMEOUT,
    providerStatus: PROVIDER_STATUSES.TIMEOUT,
    platform: provider.id,
    provider: provider.label,
    accountId: account.accountId,
    username: account.username,
    supportedAlertTypes: provider.supportedAlertTypes,
    capabilities: provider.capabilities,
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    timedOut: true,
    timeoutMs,
    errorType: 'timeout',
    error: `${provider.label} provider check timed out after ${timeoutMs}ms.`,
  };
}

function circuitOpenResult(provider, account, gate) {
  return {
    success: false,
    skipped: true,
    status: PROVIDER_STATUSES.CIRCUIT_OPEN,
    providerStatus: PROVIDER_STATUSES.CIRCUIT_OPEN,
    platform: provider.id,
    provider: provider.label,
    accountId: account.accountId,
    username: account.username,
    checkedAt: new Date().toISOString(),
    responseTimeMs: 0,
    errorType: 'provider_unavailable',
    circuitOpen: true,
    retryAt: gate.retryAt,
    retryAfterMs: gate.remainingMs,
    providerHealth: gate.state,
    providerIncident: providerIncidents.escalation(gate.state),
    error: `${provider.label} provider circuit is open until ${gate.retryAt}.`,
  };
}

async function executeWithTimeout(provider, account, timeoutMs) {
  const startedAt = Date.now();
  let timeoutRef;
  const timeout = new Promise((resolve) => {
    timeoutRef = setTimeout(() => resolve(timeoutResult(provider, account, timeoutMs, startedAt)), timeoutMs);
    timeoutRef.unref?.();
  });

  try {
    const providerCheck = Promise.resolve()
      .then(() => provider.handler.checkAccount(account))
      .then((result) => ({
        ...(result || {}),
        platform: result?.platform || provider.id,
        provider: result?.provider || provider.label,
        providerStatus: result?.providerStatus || result?.status || (result?.success ? PROVIDER_STATUSES.READY : PROVIDER_STATUSES.ERROR),
        checkedAt: result?.checkedAt || new Date().toISOString(),
        responseTimeMs: Number(result?.responseTimeMs || Date.now() - startedAt),
      }))
      .catch((error) => ({
        success: false,
        status: PROVIDER_STATUSES.ERROR,
        providerStatus: PROVIDER_STATUSES.ERROR,
        platform: provider.id,
        provider: provider.label,
        accountId: account.accountId,
        username: account.username,
        checkedAt: new Date().toISOString(),
        responseTimeMs: Date.now() - startedAt,
        errorType: error?.type || 'network',
        error: error?.message || String(error),
      }));

    return await Promise.race([providerCheck, timeout]);
  } finally {
    clearTimeout(timeoutRef);
  }
}

async function checkAccount(account = {}, options = {}) {
  const provider = getProvider(account.platform);
  if (!provider) {
    return {
      success: false,
      status: PROVIDER_STATUSES.ERROR,
      providerStatus: PROVIDER_STATUSES.ERROR,
      checkedAt: new Date().toISOString(),
      responseTimeMs: 0,
      error: `Unsupported social platform: ${account.platform || 'unknown'}`,
    };
  }

  if (provider.status !== PROVIDER_STATUSES.READY) {
    const error = provider.status === PROVIDER_STATUSES.AUTHORIZATION_REQUIRED
      ? provider.unavailableReason
      : provider.status === PROVIDER_STATUSES.NOT_CONFIGURED
        ? `${provider.label} provider is missing global Goliath credentials.`
        : `${provider.label} provider polling is not implemented yet.`;
    return unavailableResult(provider, account, error);
  }

  if (typeof provider.handler?.checkAccount !== 'function') {
    return unavailableResult({ ...provider, status: PROVIDER_STATUSES.ERROR }, account, `${provider.label} provider handler is unavailable.`);
  }

  const before = providerHealth.snapshot(provider.id);
  const gate = providerHealth.acquire(provider.id);
  if (!gate.allowed) return circuitOpenResult(provider, account, gate);

  const result = await executeWithTimeout(provider, account, normalizeTimeoutMs(options.timeoutMs));
  const health = providerHealth.record(provider.id, result);
  const incident = providerIncidents.transition(before, health);
  return { ...result, providerHealth: health, providerIncident: incident };
}

module.exports = {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MIN_PROVIDER_TIMEOUT_MS,
  MAX_PROVIDER_TIMEOUT_MS,
  PROVIDER_STATUSES,
  DEFAULT_CAPABILITIES,
  normalizeTimeoutMs,
  getProvider,
  listProviders,
  checkAccount,
};
