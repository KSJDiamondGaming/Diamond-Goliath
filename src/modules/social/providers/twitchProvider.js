'use strict';

const socialHttp = require('../socialHttp');

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API_URL = 'https://api.twitch.tv/helix';

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function getConfig() {
  return {
    clientId: String(process.env.TWITCH_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.TWITCH_CLIENT_SECRET || '').trim(),
  };
}

function isConfigured() {
  const config = getConfig();
  return Boolean(config.clientId && config.clientSecret);
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

async function getAccessToken() {
  const config = getConfig();
  if (!config.clientId || !config.clientSecret) return null;
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });
  const result = await socialHttp.requestJson(`${TWITCH_AUTH_URL}?${params.toString()}`, {
    provider: 'twitch',
    method: 'POST',
  });
  cachedToken = result.data?.access_token || null;
  cachedTokenExpiresAt = Date.now() + Math.max(60, Number(result.data?.expires_in || 3600) - 120) * 1000;
  return cachedToken;
}

async function twitchApi(path, params = {}) {
  const config = getConfig();
  const token = await getAccessToken();
  if (!token) throw new Error('Twitch provider is missing global Goliath credentials.');

  const query = new URLSearchParams(params);
  return socialHttp.requestJson(`${TWITCH_API_URL}${path}?${query.toString()}`, {
    provider: 'twitch',
    headers: {
      'Client-ID': config.clientId,
      Authorization: `Bearer ${token}`,
    },
  });
}

async function checkAccount(account = {}) {
  const username = normalizeUsername(account.username || account.externalId);
  const checkedAt = new Date().toISOString();

  if (!isConfigured()) {
    return {
      success: false,
      status: 'not_configured',
      providerStatus: 'not_configured',
      platform: 'twitch',
      accountId: account.accountId,
      username,
      checkedAt,
      error: 'Twitch provider is missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET.',
    };
  }

  if (!username) {
    return {
      success: false,
      status: 'error',
      providerStatus: 'error',
      platform: 'twitch',
      accountId: account.accountId,
      checkedAt,
      error: 'Twitch username is missing.',
    };
  }

  try {
    const userResult = await twitchApi('/users', { login: username });
    const user = userResult.data?.data?.[0];
    if (!user) {
      return {
        success: false,
        status: 'error',
        providerStatus: 'error',
        platform: 'twitch',
        accountId: account.accountId,
        username,
        checkedAt,
        responseTimeMs: userResult.responseTimeMs,
        error: `Twitch user not found: ${username}`,
      };
    }

    const streamResult = await twitchApi('/streams', { user_id: user.id });
    const stream = streamResult.data?.data?.[0] || null;
    const isLive = Boolean(stream);

    return {
      success: true,
      status: 'ready',
      providerStatus: 'ready',
      platform: 'twitch',
      accountId: account.accountId,
      username,
      checkedAt,
      responseTimeMs: userResult.responseTimeMs + streamResult.responseTimeMs,
      isLive,
      alertType: 'live',
      contentId: stream?.id || null,
      externalId: user.id,
      displayName: user.display_name || account.displayName || username,
      title: stream?.title || '',
      gameName: stream?.game_name || '',
      viewerCount: Number(stream?.viewer_count || 0),
      thumbnailUrl: stream?.thumbnail_url || '',
      url: `https://twitch.tv/${username}`,
      raw: {
        userId: user.id,
        streamStartedAt: stream?.started_at || null,
      },
    };
  } catch (error) {
    if (error.status === 401) {
      cachedToken = null;
      cachedTokenExpiresAt = 0;
    }
    return {
      success: false,
      status: 'error',
      providerStatus: 'error',
      platform: 'twitch',
      accountId: account.accountId,
      username,
      checkedAt,
      errorType: error.type || 'provider_error',
      error: error.message || 'Twitch provider check failed.',
    };
  }
}

module.exports = {
  id: 'twitch',
  label: 'Twitch',
  implemented: true,
  isConfigured,
  normalizeUsername,
  checkAccount,
};