async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `API request failed: ${response.status}`
    );
  }

  return data;
}

export const api = {
  request,

  getStatus() {
    return request('/api/status');
  },

  getAuthMe() {
    return request('/api/auth/me');
  },

  getLoginUrl() {
    return '/api/auth/discord';
  },

  logout() {
    return request('/api/auth/logout', {
      method: 'POST',
    });
  },

  getGuilds() {
    return request('/api/discord/guilds');
  },

  getCases(guildId) {
    return request(`/api/cases/${guildId}`);
  },

  getWarnings(guildId) {
    return request(`/api/cases/${guildId}/warnings`);
  },

  getSecurityOverview(guildId) {
    return request(`/api/security/overview?guildId=${guildId}`);
  },
};

export default api;