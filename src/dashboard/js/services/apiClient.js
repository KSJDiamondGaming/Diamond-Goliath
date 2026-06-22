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

  /* ---------------- OWNER ---------------- */

  getOwnerMe() {
    return request('/api/owner/me');
  },

  getOwnerGuilds() {
    return request('/api/owner/guilds/all');
  },

  getPlatformRuntime() {
    return request('/api/owner/runtime');
  },

  getOwnerRuntime(guildId) {
    return request(
      `/api/status?guildId=${guildId}`,
    );
  },

  getOwnerSecurity(guildId) {
    return request(
      `/api/security/overview?guildId=${guildId}`,
    );
  },

  getPermissionHealth(guildId) {
    return request(`/api/permission-health/${guildId}`);
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

  /* ---------------- MODULES ---------------- */

  getGuildModules(guildId) {
    return request(`/api/modules/${guildId}`);
  },

  setGuildModuleEnabled(guildId, moduleKey, enabled) {
    return request(`/api/modules/${guildId}/${moduleKey}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  /* ---------------- BILLING ---------------- */

  getBillingPlans() {
    return request('/api/billing/plans');
  },

  getBillingSubscription(guildId) {
    return request(`/api/billing/subscription/${guildId}`);
  },

  getBillingEntitlements(guildId) {
    return request(`/api/billing/entitlements/${guildId}`);
  },

  /* ---------------- TRANSLATION ---------------- */

  getTranslationConfig(guildId) {
    return request(`/api/translation/${guildId}`);
  },

  getTranslationProvider(guildId) {
    return request(`/api/translation/${guildId}/provider`);
  },

  saveTranslationProvider(guildId, payload) {
    return request(`/api/translation/${guildId}/provider`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  setTranslationEnabled(guildId, enabled) {
    return request(`/api/translation/${guildId}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  /* ---------------- EMBED STUDIO ---------------- */

  getEmbedStudio(guildId) {
    return request(`/api/modules/${guildId}/embed-studio`);
  },

  saveEmbedDraft(guildId, payload) {
    return request(`/api/modules/${guildId}/embed-studio/draft`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  saveEmbedPreset(guildId, name, payload) {
    return request(`/api/modules/${guildId}/embed-studio/presets`, {
      method: 'POST',
      body: JSON.stringify({ name, ...payload }),
    });
  },

  deleteEmbedPreset(guildId, name) {
    return request(`/api/modules/${guildId}/embed-studio/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },

  deleteEmbedDeployment(guildId, key) {
    return request(`/api/modules/${guildId}/embed-studio/deployments/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
  },

  /* ---------------- VERIFICATION ---------------- */

  getVerification(guildId) {
    return request(`/api/modules/${guildId}/verification`);
  },

  setVerificationEnabled(guildId, enabled) {
    return request(`/api/modules/${guildId}/verification/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  saveVerificationSettings(guildId, settings) {
    return request(`/api/modules/${guildId}/verification/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    });
  },

  saveVerificationConfig(guildId, payload) {
    return request(`/api/modules/${guildId}/verification`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  saveVerificationPanel(guildId, payload) {
    return request(`/api/modules/${guildId}/verification/panels`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deployVerificationPanel(guildId, payload) {
    return request(`/api/modules/${guildId}/verification/panels/deploy`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  refreshVerificationPanel(guildId, panelId, payload) {
    return request(`/api/modules/${guildId}/verification/panels/${panelId}/refresh`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getVerificationAnalytics(guildId) {
    return request(`/api/modules/${guildId}/verification/analytics`);
  },

  /* ---------------- AUTO ROLES ---------------- */

  getAutoRoles(guildId) {
    return request(`/api/modules/${guildId}/auto-roles`);
  },
};
