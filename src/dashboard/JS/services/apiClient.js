async function request(
  url,
  options = {}
) {
  const response = await fetch(url, {
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
        `API request failed: ${response.status}`
    );
  }

  return data;
}

export const api = {
  request,

  /* ---------------- CORE ---------------- */

  getStatus() {
    return request('/api/status');
  },

  /* ---------------- AUTH ---------------- */

  getAuthMe() {
    return request('/api/auth/me');
  },

  getLoginUrl() {
    return '/api/auth/login';
  },

  logout() {
    return request('/api/auth/logout', {
      method: 'POST',
    });
  },

  /* ---------------- DISCORD ---------------- */

  getGuilds() {
    return request('/api/discord/guilds');
  },

  /* ---------------- CASES ---------------- */

  getCases(guildId) {
    return request(
      `/api/cases/${guildId}`
    );
  },

  getWarnings(guildId) {
    return request(
      `/api/cases/${guildId}/warnings`
    );
  },

  /* ---------------- SECURITY ---------------- */

  getSecurityOverview(guildId) {
    return request(
      `/api/security/overview?guildId=${guildId}`
    );
  },
};

export default api;