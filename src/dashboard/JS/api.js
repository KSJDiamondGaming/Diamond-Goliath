const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3001';

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

function buildUrl(path) {
  return `${API_BASE}${path}`;
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
    throw new Error(`Request failed (${response.status}): ${errorText.slice(0, 160)}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '');
    throw new Error(`Expected JSON but received: ${text.slice(0, 160)}`);
  }

  const data = await response.json();

  if (ttl > 0) {
    setCache(cacheKey, data, ttl);
  }

  return data;
}

async function requestOptionalJson(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 401) return null;

  if (!response.ok) {
    const errorText = await parseErrorResponse(response);
    throw new Error(`Request failed (${response.status}): ${errorText.slice(0, 160)}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return null;
  }

  return response.json();
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
  clearCacheKey,

  getLoginUrl() {
    return buildUrl('/api/auth/login');
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
    if (force) clearCacheKey('GET:/api/discord/guilds');

    const result = await request('/api/discord/guilds');
    return result?.authenticated === false ? [] : result;
  },

  getGuildChannels(guildId, { force = false } = {}) {
    const path = `/api/discord/guilds/${guildId}/channels`;

    if (force) clearCacheKey(`GET:${path}`);

    return request(path);
  },

  getStatus(guildId, { force = false } = {}) {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
    const path = `/api/status${query}`;

    if (force) clearCacheKey(`GET:${path}`);

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
    const stream = new EventSource(buildUrl(`/api/status/stream${query}`), {
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