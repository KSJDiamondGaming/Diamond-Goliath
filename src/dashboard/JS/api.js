import { io } from 'socket.io-client';

/* ---------------- BASE ---------------- */

const IS_LOCAL_DEV =
  import.meta.env.DEV ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (IS_LOCAL_DEV ? 'http://localhost:3001' : '');

const socket = io(API_BASE || window.location.origin, {
  withCredentials: true,
});

/* ---------------- CACHE ---------------- */

const cache = new Map();

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function clearCache() {
  cache.clear();
}

function clearCacheKey(key) {
  cache.delete(key);
}

function getCacheTtl(path) {
  if (path === '/api/discord/guilds') return 30_000;
  if (path.startsWith('/api/status')) return 10_000;
  if (path.includes('/channels')) return 30_000;
  return 0;
}

/* ---------------- REQUEST ---------------- */

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const safePath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${safePath}`;
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => '');
  return text || response.statusText || 'Unknown error';
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;
  const ttl = method === 'GET' ? getCacheTtl(path) : 0;

  if (ttl > 0) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 401) {
    return { authenticated: false, user: null };
  }

  if (!response.ok) {
    const errorText = await parseErrorResponse(response);
    throw new Error(
      `Request failed (${response.status}): ${errorText.slice(0, 160)}`
    );
  }

  const data = await response.json();

  if (ttl > 0) {
    setCache(cacheKey, data, ttl);
  }

  return data;
}

function jsonPost(path, body) {
  clearCache();

  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

/* ---------------- SOCKET SYNC ---------------- */

export function joinGuildRoom(guildId) {
  if (!guildId) return;

  socket.emit('joinGuild', guildId);
  socket.emit('automod:join', guildId);
}

export function listenForGuildUpdate(handler) {
  if (typeof handler !== 'function') return () => {};

  const wrapped = (payload) => {
    handler(payload);
  };

  socket.on('guild:update', wrapped);

  return () => {
    socket.off('guild:update', wrapped);
  };
}

/* ---------------- API ---------------- */

export const api = {
  clearCache,
  clearCacheKey,

  getApiBase() {
    return API_BASE;
  },

  getLoginUrl() {
    return buildUrl('/api/auth/login');
  },

  logout() {
    clearCache();
    return request('/api/auth/logout', { method: 'POST' });
  },

  getAuthMe() {
    return request('/api/auth/me');
  },

  getGuilds() {
    return request('/api/discord/guilds');
  },

  getDebugGuilds() {
    return request('/api/discord/debug-guilds');
  },

  getGuildChannels(guildId) {
    return request(`/api/discord/guilds/${guildId}/channels`);
  },

  getStatus(guildId) {
    const query = guildId ? `?guildId=${guildId}` : '';
    return request(`/api/status${query}`);
  },

  getCases(guildId) {
    return request(`/api/cases/${guildId}`);
  },

  getWarnings(guildId) {
    return request(`/api/cases/${guildId}/warnings`);
  },

  getConfig(guildId) {
    return request(`/api/config/${guildId}`);
  },

  updateConfig(guildId, body) {
    return jsonPost(`/api/config/${guildId}`, body);
  },

  getMessages(guildId) {
    return request(`/api/config/messages/${guildId}`);
  },

  saveMessages(guildId, body) {
    return jsonPost(`/api/config/messages/${guildId}`, body);
  },

  getAutoModConfig(guildId) {
    return request(`/api/config/automod/${guildId}`);
  },

  saveAutoModConfig(guildId, body) {
    return jsonPost(`/api/config/automod/${guildId}`, body);
  },

  resetAutoModConfig(guildId) {
    return jsonPost(`/api/config/automod/${guildId}/reset`);
  },

  getLogConfig(guildId) {
    return request(`/api/config/logs/${guildId}`);
  },

  saveLogConfig(guildId, body) {
    return jsonPost(`/api/config/logs/${guildId}`, body);
  },
};