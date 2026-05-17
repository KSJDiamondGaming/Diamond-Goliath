import { io } from 'socket.io-client';

/* ---------------- BASE ---------------- */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001';

const socket = io(API_BASE, {
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
  return `${API_BASE}${path}`;
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => '');
  return text || response.statusText || 'Unknown error';
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const force = Boolean(options.force);

  const fetchOptions = { ...options };
  delete fetchOptions.force;

  const cacheKey = `${method}:${path}`;
  const ttl = method === 'GET' ? getCacheTtl(path) : 0;

  if (!force && ttl > 0) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.headers || {}),
    },
    ...fetchOptions,
  });

  if (response.status === 401) {
    return { authenticated: false, user: null };
  }

  if (!response.ok) {
    const errorText = await parseErrorResponse(response);
    throw new Error(`Request failed (${response.status}): ${errorText.slice(0, 160)}`);
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

export function listenForGuildUpdate(guildIdOrHandler, sectionOrHandler, maybeHandler) {
  let guildId = '';
  let section = '';
  let handler = null;

  if (typeof guildIdOrHandler === 'function') {
    handler = guildIdOrHandler;
  } else {
    guildId = String(guildIdOrHandler || '').trim();

    if (typeof sectionOrHandler === 'function') {
      handler = sectionOrHandler;
    } else {
      section = String(sectionOrHandler || '').trim();
      handler = maybeHandler;
    }
  }

  if (typeof handler !== 'function') {
    return () => {};
  }

  const wrapped = (payload = {}) => {
    if (guildId && String(payload.guildId || '') !== guildId) {
      return;
    }

    if (section && String(payload.section || '') !== section) {
      return;
    }

    handler(payload.data, payload);
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

  getLoginUrl() {
    return buildUrl('/api/auth/login');
  },

  logout() {
    clearCache();
    return request('/api/auth/logout', { method: 'POST' });
  },

  getAuthMe(options = {}) {
    return request('/api/auth/me', options);
  },

  getGuilds(options = {}) {
    return request('/api/discord/guilds', options);
  },

  getGuildChannels(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getGuildChannels requires a guildId');
    }

    return request(`/api/discord/guilds/${encodeURIComponent(guildId)}/channels`, options);
  },

  getStatus(guildId, options = {}) {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
    return request(`/api/status${query}`, options);
  },

  getCases(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getCases requires a guildId');
    }

    return request(`/api/cases/${encodeURIComponent(guildId)}`, options);
  },

  getWarnings(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getWarnings requires a guildId');
    }

    return request(`/api/cases/${encodeURIComponent(guildId)}/warnings`, options);
  },

  getConfig(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getConfig requires a guildId');
    }

    return request(`/api/config/${encodeURIComponent(guildId)}`, options);
  },

  updateConfig(guildId, body) {
    if (!guildId) {
      throw new Error('updateConfig requires a guildId');
    }

    return jsonPost(`/api/config/${encodeURIComponent(guildId)}`, body);
  },

  getMessages(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getMessages requires a guildId');
    }

    return request(`/api/config/messages/${encodeURIComponent(guildId)}`, options);
  },

  saveMessages(guildId, body) {
    if (!guildId) {
      throw new Error('saveMessages requires a guildId');
    }

    return jsonPost(`/api/config/messages/${encodeURIComponent(guildId)}`, body);
  },

  getAutoModConfig(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getAutoModConfig requires a guildId');
    }

    return request(`/api/config/automod/${encodeURIComponent(guildId)}`, options);
  },

  saveAutoModConfig(guildId, body) {
    if (!guildId) {
      throw new Error('saveAutoModConfig requires a guildId');
    }

    return jsonPost(`/api/config/automod/${encodeURIComponent(guildId)}`, body);
  },

  resetAutoModConfig(guildId) {
    if (!guildId) {
      throw new Error('resetAutoModConfig requires a guildId');
    }

    return jsonPost(`/api/config/automod/${encodeURIComponent(guildId)}/reset`);
  },

  getLogConfig(guildId, options = {}) {
    if (!guildId) {
      throw new Error('getLogConfig requires a guildId');
    }

    return request(`/api/config/logs/${encodeURIComponent(guildId)}`, options);
  },

  saveLogConfig(guildId, body) {
    if (!guildId) {
      throw new Error('saveLogConfig requires a guildId');
    }

    return jsonPost(`/api/config/logs/${encodeURIComponent(guildId)}`, body);
  },
};