const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

function apiUrl(path = '') {
  return `${API_BASE}${path}`;
}

async function request(url, options = {}) {
  const response = await fetch(apiUrl(url), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `API request failed: ${response.status}`);
  }

  return data;
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });

  return query.toString();
}

export const api = {
  request,
  buildQuery,
  getStatus: (guildId = '') => request(`/api/status${guildId ? `?guildId=${guildId}` : ''}`),
  getAuthMe: () => request('/api/auth/me'),
  getLoginUrl: () => apiUrl('/api/auth/login'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getOwnerMe: () => request('/api/owner/me'),
  getOwnerDiagnostics: () => request('/api/owner/diagnostics'),
  getOwnerGuilds: () => request('/api/owner/guilds/all'),
  getPlatformRuntime: () => request('/api/owner/runtime'),
  getOwnerBackups: (environment = 'all') => request(`/api/owner/backups?environment=${encodeURIComponent(environment)}`),
  createOwnerManualBackup: (payload) => request('/api/owner/backups/manual', { method: 'POST', body: JSON.stringify(payload) }),
  getOwnerRuntime: (guildId) => request(`/api/status?guildId=${guildId}`),
  getOwnerSecurity: (guildId) => request(`/api/security/overview?guildId=${guildId}`),
  getPermissionHealth: (guildId) => request(`/api/permissions/${guildId}`),
  getRestoreBackups: (guildId) => request(`/api/restore/${guildId}/backups`),
  getRestoreBackup: (guildId, backupId) => request(`/api/restore/${guildId}/backups/${encodeURIComponent(backupId)}`),
  compareRestoreBackup: (guildId, backupId) => request(`/api/restore/${guildId}/restore/compare`, { method: 'POST', body: JSON.stringify({ backupId }) }),
  previewRestoreBackup: (guildId, backupId, options = {}) => request(`/api/restore/${guildId}/restore/preview`, { method: 'POST', body: JSON.stringify({ backupId, options }) }),
  executeRestoreBackup: (guildId, payload = {}) => request(`/api/restore/${guildId}/restore/execute`, { method: 'POST', body: JSON.stringify(payload) }),
  getGuilds: () => request('/api/discord/guilds'),
  getGuildChannels: (guildId) => request(`/api/discord/${guildId}/channels`),
  getGuildRoles: (guildId) => request(`/api/discord/${guildId}/roles`),
  createGuildRole: (guildId, payload) => request(`/api/discord/${guildId}/roles`, { method: 'POST', body: JSON.stringify(payload) }),
  getGeneralSettings: (guildId) => request(`/api/config/${guildId}`),
  saveGeneralSettings: (guildId, payload) => request(`/api/config/${guildId}`, { method: 'POST', body: JSON.stringify(payload) }),
  getGuildModules: (guildId) => request(`/api/modules/${guildId}`),
  setGuildModuleEnabled: (guildId, moduleKey, enabled) => request(`/api/modules/${guildId}/${moduleKey}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  getBillingPlans: () => request('/api/billing/plans'),
  getBillingSubscription: (guildId) => request(`/api/billing/subscription/${guildId}`),
  getBillingEntitlements: (guildId) => request(`/api/billing/entitlements/${guildId}`),
  getTranslationConfig: (guildId) => request(`/api/translation/${guildId}`),
  getTranslationProvider: (guildId) => request(`/api/translation/${guildId}/provider`),
  saveTranslationProvider: (guildId, payload) => request(`/api/translation/${guildId}/provider`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setTranslationEnabled: (guildId, enabled) => request(`/api/translation/${guildId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  getEmbedStudio: (guildId) => request(`/api/modules/${guildId}/embed-studio`),
  saveEmbedDraft: (guildId, payload) => request(`/api/modules/${guildId}/embed-studio/draft`, { method: 'POST', body: JSON.stringify(payload) }),
  saveEmbedPreset: (guildId, name, payload) => request(`/api/modules/${guildId}/embed-studio/presets`, { method: 'POST', body: JSON.stringify({ name, ...payload }) }),
  deleteEmbedPreset: (guildId, name) => request(`/api/modules/${guildId}/embed-studio/presets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  deleteEmbedDeployment: (guildId, key) => request(`/api/modules/${guildId}/embed-studio/deployments/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  deletePoll: (guildId, pollId) => request(`/api/polls/${guildId}/polls/${pollId}`, { method: 'DELETE' }),
  getStatsOverview: (guildId) => request(`/api/stats/${guildId}/overview`),
};

export default api;
