const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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

export const api = {
  getGuilds() {
    return request('/api/discord/guilds');
  },

 getStatus(guildId) {
  const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
  return request(`/api/status${query}`);
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

  getMessages() {
    return request('/api/config/messages');
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
};