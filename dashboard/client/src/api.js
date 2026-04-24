const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';

  // ✅ HANDLE AUTH CLEANLY (THIS FIXES YOUR SPAM)
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

  return response.json();
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

  // ✅ ALSO HANDLE 401 HERE
  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text.slice(0, 160)}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return null;
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

export const api = {
  getLoginUrl() {
    return `${API_BASE}/api/auth/login`;
  },

  logout() {
    return requestOptionalJson('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getAuthMe() {
    return request('/api/auth/me');
  },

  async getGuilds() {
    const result = await request('/api/discord/guilds');

    // ✅ STOP CALLING IF NOT AUTHENTICATED
    if (result?.authenticated === false) {
      return [];
    }

    return result;
  },

  getGuildChannels(guildId) {
    return request(`/api/discord/guilds/${guildId}/channels`);
  },

  getStatus(guildId) {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
    return request(`/api/status${query}`);
  },

  createStatusStream(guildId, handlers = {}) {
    if (!guildId || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return { close() {} };
    }

    const query = `?guildId=${encodeURIComponent(guildId)}`;
    const stream = new EventSource(buildStreamUrl(`/api/status/stream${query}`), {
      withCredentials: true,
    });

    const safe = (fn) => (typeof fn === 'function' ? fn : () => {});

    stream.onopen = safe(handlers.onOpen);
    stream.onerror = safe(handlers.onError);

    stream.addEventListener('status', (e) => {
      const data = safeParseStreamData(e.data);
      if (data) safe(handlers.onStatus)(data);
    });

    stream.addEventListener('cases', (e) => {
      const data = safeParseStreamData(e.data);
      if (data) safe(handlers.onCases)(data);
    });

    stream.addEventListener('warnings', (e) => {
      const data = safeParseStreamData(e.data);
      if (data) safe(handlers.onWarnings)(data);
    });

    stream.addEventListener('snapshot', (e) => {
      const data = safeParseStreamData(e.data);
      if (data) safe(handlers.onSnapshot)(data);
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
    return request(`/api/warnings/${guildId}`);
  },

  getConfig(guildId) {
    return request(`/api/config/${guildId}`);
  },

  updateConfig(guildId, body) {
    return request(`/api/config/${guildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  getMessages(guildId) {
    return request(`/api/config/messages/${guildId}`);
  },

  saveMessages(guildId, body) {
    return request(`/api/config/messages/${guildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  getAutoModConfig(guildId) {
    return request(`/api/automod/${guildId}`);
  },

  saveAutoModConfig(guildId, body) {
    return request(`/api/automod/${guildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  getLogConfig(guildId) {
    return request(`/api/config/logs/${guildId}`);
  },

  saveLogConfig(guildId, body) {
    return request(`/api/config/logs/${guildId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};