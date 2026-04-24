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

  getGuilds() {
    return request('/api/discord/guilds');
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
      return {
        close() {},
      };
    }

    const query = `?guildId=${encodeURIComponent(guildId)}`;
    const stream = new EventSource(buildStreamUrl(`/api/status/stream${query}`), {
      withCredentials: true,
    });

    const handleOpen =
      typeof handlers.onOpen === 'function'
        ? handlers.onOpen
        : () => {};

    const handleError =
      typeof handlers.onError === 'function'
        ? handlers.onError
        : () => {};

    const handleStatus =
      typeof handlers.onStatus === 'function'
        ? handlers.onStatus
        : () => {};

    const handleCases =
      typeof handlers.onCases === 'function'
        ? handlers.onCases
        : () => {};

    const handleWarnings =
      typeof handlers.onWarnings === 'function'
        ? handlers.onWarnings
        : () => {};

    const handleSnapshot =
      typeof handlers.onSnapshot === 'function'
        ? handlers.onSnapshot
        : () => {};

    stream.onopen = (event) => {
      handleOpen(event);
    };

    stream.onerror = (event) => {
      handleError(event);
    };

    stream.addEventListener('status', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) handleStatus(payload);
    });

    stream.addEventListener('cases', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) handleCases(payload);
    });

    stream.addEventListener('warnings', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) handleWarnings(payload);
    });

    stream.addEventListener('snapshot', (event) => {
      const payload = safeParseStreamData(event.data);
      if (payload) handleSnapshot(payload);
    });

    return {
      close() {
        stream.close();
      },
    };
  },

  getAuthMe() {
    return request('/api/auth/me');
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  getMessages(guildId) {
    return request(`/api/config/messages/${guildId}`);
  },

  saveMessages(guildId, body) {
    return request(`/api/config/messages/${guildId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  getAutoModConfig(guildId) {
    return request(`/api/automod/${guildId}`);
  },

  saveAutoModConfig(guildId, body) {
    return request(`/api/automod/${guildId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },

  getLogConfig(guildId) {
    return request(`/api/config/logs/${guildId}`);
  },

  saveLogConfig(guildId, body) {
    return request(`/api/config/logs/${guildId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  },
};
