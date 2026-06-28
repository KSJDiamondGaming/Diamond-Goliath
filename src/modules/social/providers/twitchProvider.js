'use strict';

// src/modules/social/providers/twitchProvider.js

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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  const data = body ? JSON.parse(body) : null;

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText || 'Twitch request failed';
    throw new Error(`${message} (${response.status})`);
  }

  return data;
}

async function getAccessToken() {
  const config = getConfig();

  if (!config.clientId || !config.clientSecret) {
    return null;
  }

  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });

  const data = await fetchJson(`${TWITCH_AUTH_URL}?${params.toString()}`, { method: 'POST' });
  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000;

  return cachedToken;
}

async function twitchApi(path, params = {}) {
  const config = getConfig();
  const token = await getAccessToken();

  if (!token) {
    return { success: false, status: 'not_configured', error: 'Twitch provider is missing credentials.' };
  }

  const query = new URLSearchParams(params);
  return fetchJson(`${TWITCH_API_URL}${path}?${query.toString()}`, {
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
      platform: 'twitch',
      accountId: account.accountId,
      checkedAt,
      error: 'Twitch username is missing.',
    };
  }

  try {
    const userPayload = await twitchApi('/users', { login: username });
    const user = userPayload?.data?.[0];

    if (!user) {
      return {
        success: false,
        status: 'error',
        platform: 'twitch',
        accountId: account.accountId,
        username,
        checkedAt,
        error: `Twitch user not found: ${username}`,
      };
    }

    const streamPayload = await twitchApi('/streams', { user_id: user.id });
    const stream = streamPayload?.data?.[0] || null;
    const isLive = Boolean(stream);
    const streamId = stream?.id || null;

    return {
      success: true,
      status: 'ready',
      platform: 'twitch',
      accountId: account.accountId,
      username,
      checkedAt,
      providerStatus: 'ready',
      isLive,
      contentId: streamId,
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
    return {
      success: false,
      status: 'error',
      platform: 'twitch',
      accountId: account.accountId,
      username,
      checkedAt,
      error: error.message || 'Twitch provider check failed.',
    };
  }
}

module.exports = {
  id: 'twitch',
  label: 'Twitch',
  isConfigured,
  checkAccount,
};
