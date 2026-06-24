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
  getOwnerGuilds: () => request('/api/owner/guilds/all'),
  getPlatformRuntime: () => request('/api/owner/runtime'),
  getOwnerRuntime: (guildId) => request(`/api/status?guildId=${guildId}`),
  getOwnerSecurity: (guildId) => request(`/api/security/overview?guildId=${guildId}`),
  getPermissionHealth: (guildId) => request(`/api/permission-health/${guildId}`),
  getGuilds: () => request('/api/discord/guilds'),
  getGuildChannels: (guildId) => request(`/api/discord/${guildId}/channels`),
  getGuildRoles: (guildId) => request(`/api/discord/${guildId}/roles`),
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
  getVerification: (guildId) => request(`/api/modules/${guildId}/verification`),
  setVerificationEnabled: (guildId, enabled) => request(`/api/modules/${guildId}/verification/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  saveVerificationSettings: (guildId, settings) => request(`/api/modules/${guildId}/verification/settings`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
  saveVerificationConfig: (guildId, payload) => request(`/api/modules/${guildId}/verification`, { method: 'PUT', body: JSON.stringify(payload) }),
  saveVerificationPanel: (guildId, payload) => request(`/api/modules/${guildId}/verification/panels`, { method: 'POST', body: JSON.stringify(payload) }),
  deployVerificationPanel: (guildId, payload) => request(`/api/modules/${guildId}/verification/panels/deploy`, { method: 'POST', body: JSON.stringify(payload) }),
  refreshVerificationPanel: (guildId, panelId, payload) => request(`/api/modules/${guildId}/verification/panels/${panelId}/refresh`, { method: 'POST', body: JSON.stringify(payload) }),
  getVerificationAnalytics: (guildId) => request(`/api/modules/${guildId}/verification/analytics`),
  getAutoRoles: (guildId) => request(`/api/modules/${guildId}/auto-roles`),
  setAutoRolesEnabled: (guildId, enabled) => request(`/api/modules/${guildId}/auto-roles/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  saveAutoRolesSettings: (guildId, settings) => request(`/api/modules/${guildId}/auto-roles/settings`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
  saveAutoRolesConfig: (guildId, payload) => request(`/api/modules/${guildId}/auto-roles`, { method: 'PUT', body: JSON.stringify(payload) }),
  addJoinAutoRole: (guildId, roleId) => request(`/api/modules/${guildId}/auto-roles/join`, { method: 'POST', body: JSON.stringify({ roleId }) }),
  removeJoinAutoRole: (guildId, roleId) => request(`/api/modules/${guildId}/auto-roles/join/${roleId}`, { method: 'DELETE' }),
  addBotAutoRole: (guildId, roleId) => request(`/api/modules/${guildId}/auto-roles/bots`, { method: 'POST', body: JSON.stringify({ roleId }) }),
  removeBotAutoRole: (guildId, roleId) => request(`/api/modules/${guildId}/auto-roles/bots/${roleId}`, { method: 'DELETE' }),
  getAutoRolesAnalytics: (guildId) => request(`/api/modules/${guildId}/auto-roles/analytics`),
  getAutoModConfig: (guildId) => request(`/api/config/automod/${guildId}`),
  saveAutoModConfig: (guildId, payload) => request(`/api/config/automod/${guildId}`, { method: 'POST', body: JSON.stringify(payload) }),
  getMessages: (guildId) => request(`/api/config/messages/${guildId}`),
  saveMessages: (guildId, payload) => request(`/api/config/messages/${guildId}`, { method: 'POST', body: JSON.stringify(payload) }),
  getCases: (guildId) => request(`/api/cases/${guildId}`),
  getWarnings: (guildId) => request(`/api/cases/${guildId}/warnings`),
  getTicketOverview: (guildId) => request(`/api/tickets/${guildId}/overview`),
  getTickets: (guildId) => request(`/api/tickets/${guildId}`),
  runTicketRecovery: (guildId, createMissingChannels = false) => request(`/api/tickets/${guildId}/recovery`, { method: 'POST', body: JSON.stringify({ createMissingChannels }) }),
  runTicketRecoveryScan: (guildId) => request(`/api/tickets/${guildId}/recovery`, { method: 'POST', body: JSON.stringify({ createMissingChannels: false }) }),
  recreateMissingTicketChannels: (guildId) => request(`/api/tickets/${guildId}/recovery`, { method: 'POST', body: JSON.stringify({ createMissingChannels: true }) }),
  getFormsOverview: (guildId) => request(`/api/forms/${guildId}/overview`),
  getFormsWorkflowOverview: (guildId) => request(`/api/forms/${guildId}/overview`),
  getFormsConfig: (guildId) => request(`/api/forms/${guildId}`),
  getForms: (guildId) => request(`/api/forms/${guildId}/forms`),
  getForm: (guildId, formId) => request(`/api/forms/${guildId}/forms/${formId}`),
  createForm: (guildId, payload) => request(`/api/forms/${guildId}/forms`, { method: 'POST', body: JSON.stringify(payload) }),
  updateForm: (guildId, formId, payload) => request(`/api/forms/${guildId}/forms/${formId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  setFormEnabled: (guildId, formId, enabled) => request(`/api/forms/${guildId}/forms/${formId}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  getFormPanels: (guildId) => request(`/api/forms/${guildId}/panels`),
  getFormSubmissions: (guildId, query = '') => request(`/api/forms/${guildId}/submissions${query ? `?${query}` : ''}`),
  getFilteredFormSubmissions: (guildId, filters = {}) => {
    const query = buildQuery(filters);
    return request(`/api/forms/${guildId}/submissions${query ? `?${query}` : ''}`);
  },
  getFormSubmission: (guildId, submissionId) => request(`/api/forms/${guildId}/submissions/${submissionId}`),
  getFormSubmissionWorkflow: (guildId, submissionId) => request(`/api/forms/${guildId}/submissions/${submissionId}/workflow`),
  updateFormSubmissionStatus: (guildId, submissionId, status, extra = {}) => request(`/api/forms/${guildId}/submissions/${submissionId}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) }),
  requestFormSubmissionInfo: (guildId, submissionId, extra = {}) => request(`/api/forms/${guildId}/submissions/${submissionId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'request_info', ...extra }) }),
  updateFormsSettings: (guildId, payload) => request(`/api/forms/${guildId}/settings`, { method: 'PATCH', body: JSON.stringify(payload) }),
  getSecurityOverview: (guildId) => request(`/api/security/overview?guildId=${guildId}`),
  getLogConfig: (guildId) => request(`/api/config/logs/${guildId}`),
  saveLogConfig: (guildId, payload) => request(`/api/config/logs/${guildId}`, { method: 'POST', body: JSON.stringify(payload) }),
};

export default api;
