const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001'
  : '';

function apiUrl(path = '') {
  return `${API_BASE}${path}`;
}

async function request(
  url,
  options = {},
) {
  const response = await fetch(apiUrl(url), {
    credentials: 'include',

    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },

    ...options,
  });

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `API request failed: ${response.status}`,
    );
  }

  return data;
}

export const api = {
  request,

  /* ---------------- CORE ---------------- */

  getStatus(guildId = '') {
    const query = guildId
      ? `?guildId=${guildId}`
      : '';

    return request(
      `/api/status${query}`,
    );
  },

  /* ---------------- AUTH ---------------- */

  getAuthMe() {
    return request('/api/auth/me');
  },

  getLoginUrl() {
    return apiUrl('/api/auth/login');
  },

  logout() {
    return request(
      '/api/auth/logout',
      {
        method: 'POST',
      },
    );
  },

  /* ---------------- DISCORD ---------------- */

  getGuilds() {
    return request(
      '/api/discord/guilds',
    );
  },

  getGuildChannels(guildId) {
    return request(
      `/api/discord/${guildId}/channels`,
    );
  },

  getGuildRoles(guildId) {
    return request(
      `/api/discord/${guildId}/roles`,
    );
  },

  /* ---------------- GENERAL SETTINGS ---------------- */

getGeneralSettings(guildId) {
  return request(
    `/api/config/${guildId}`,
  );
},

saveGeneralSettings(
  guildId,
  payload,
) {
  return request(
    `/api/config/${guildId}`,
    {
      method: 'POST',

      body: JSON.stringify(
        payload,
      ),
    },
  );
},

/* ---------------- AUTOMOD ---------------- */

getAutoModConfig(guildId) {
  return request(`/api/config/automod/${guildId}`);
},

saveAutoModConfig(guildId, payload) {
  return request(`/api/config/automod/${guildId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
},

/* ---------------- MESSAGES ---------------- */

getMessages(guildId) {
  return request(
    `/api/config/messages/${guildId}`,
  );
},

saveMessages(
  guildId,
  payload,
) {
  return request(
    `/api/config/messages/${guildId}`,
    {
      method: 'POST',

      body: JSON.stringify(
        payload,
      ),
    },
  );
},

  /* ---------------- CASES ---------------- */

  getCases(guildId) {
    return request(
      `/api/cases/${guildId}`,
    );
  },

  getWarnings(guildId) {
    return request(
      `/api/cases/${guildId}/warnings`,
    );
  },

  /* ---------------- SECURITY ---------------- */

  getSecurityOverview(guildId) {
    return request(
      `/api/security/overview?guildId=${guildId}`,
    );
  },

  /* ---------------- LOGS ---------------- */

getLogConfig(guildId) {
  return request(`/api/config/logs/${guildId}`);
},

saveLogConfig(guildId, payload) {
  return request(`/api/config/logs/${guildId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
},
};

export default api;