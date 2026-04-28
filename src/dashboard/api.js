import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export const socket = io(API_BASE, {
  withCredentials: true,
});

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

export function joinGuildRoom(guildId) {
  if (!guildId) return;
  socket.emit('joinGuild', guildId);
}

export function listenForGuildUpdate(guildId, section, handler) {
  if (!guildId || !section || typeof handler !== 'function') {
    return () => {};
  }

  function onUpdate(payload = {}) {
    const payloadGuildId = payload.guildId || payload.data?.guildId;

    if (payloadGuildId && payloadGuildId !== guildId) return;
    if (payload.section !== section) return;
    if (!payload.data) return;

    handler(payload.data, payload);
  }

  socket.on('guild:update', onUpdate);

  return () => {
    socket.off('guild:update', onUpdate);
  };
}

function getCacheTtl(path) {
  if (path === '/api/discord/guilds') return 30_000;
  if (path.startsWith('/api/status')) return 10_000;
  if (path.includes('/channels')) return 30_000;
  return 0;
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;
  const ttl = method === 'GET' ? getCacheTtl(path) : 0;

  if (ttl > 0) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';

  if (response.status === 401) {
    return { authenticated: false, user: null };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text.slice(0, 160)}`);
  }

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Expected JSON but received: ${text.slice(0, 160)}`);
  }

  const data = await response.json();

  if (ttl > 0) {
    setCache(cacheKey, data, ttl);
  }

  return data;
}

async function requestOptionalJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 401) return null;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text.slice(0, 160)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : null;
}

function buildStreamUrl(path) {
  return `${API_BASE}${path}`;
}

function safeParseStreamData(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse stream payload:', error, raw);
    return null;
  }
}

function jsonPost(path, body) {
  clearCache();

  return request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
}

export const api = {
  clearCache,

  getLoginUrl() {
    return `${API_BASE}/api/auth/login`;
  },

  logout() {
    clearCache();

    return requestOptionalJson('/api/auth/logout', {
      method: 'POST',
    });
  },

  getAuthMe() {
    return request('/api/auth/me');
  },

  async getGuilds({ force = false } = {}) {
    if (force) cache.delete('GET:/api/discord/guilds');

    const result = await request('/api/discord/guilds');
    return result?.authenticated === false ? [] : result;
  },

  getGuildChannels(guildId, { force = false } = {}) {
    const path = `/api/discord/guilds/${guildId}/channels`;

    if (force) cache.delete(`GET:${path}`);

    return request(path);
  },

  getStatus(guildId, { force = false } = {}) {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
    const path = `/api/status${query}`;

    if (force) cache.delete(`GET:${path}`);

    return request(path);
  },

  createStatusStream(guildId, handlers = {}) {
    if (
      !guildId ||
      typeof window === 'undefined' ||
      typeof window.EventSource === 'undefined'
    ) {
      return { close() {} };
    }

    const query = `?guildId=${encodeURIComponent(guildId)}`;
    const stream = new EventSource(buildStreamUrl(`/api/status/stream${query}`), {
      withCredentials: true,
    });

    const safe = (fn) => (typeof fn === 'function' ? fn : () => {});

    stream.onopen = safe(handlers.onOpen);
    stream.onerror = safe(handlers.onError);

    stream.addEventListener('status', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) safe(handlers.onStatus)(payload);
    });

    stream.addEventListener('cases', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) safe(handlers.onCases)(payload);
    });

    stream.addEventListener('warnings', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) safe(handlers.onWarnings)(payload);
    });

    stream.addEventListener('snapshot', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) safe(handlers.onSnapshot)(payload);
    });

    return {
      close() {
        stream.close();
      },
    };
  },

  getCases(guildId) {
    return request(`/api/cases/${guildId}`);
  },

  clearCase(guildId, caseNumber) {
    return jsonPost(`/api/cases/${guildId}/${caseNumber}/clear`);
  } ,

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

  getLogConfig(guildId) {
    return request(`/api/config/logs/${guildId}`);
  },

  saveLogConfig(guildId, body) {
    return jsonPost(`/api/config/logs/${guildId}`, body);
  },
};