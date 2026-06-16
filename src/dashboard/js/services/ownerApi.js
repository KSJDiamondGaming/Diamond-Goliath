import { api } from './apiClient.js';

export const ownerApi = {
  getGuilds() {
    return api.getOwnerGuilds();
  },

  getRuntime() {
    return api.getPlatformRuntime();
  },

  getSecurity(guildId) {
    return api.getOwnerSecurity(guildId);
  },

  getRuntimeDetails(guildId) {
    return api.getOwnerRuntime(guildId);
  },

  getFormsOverview(guildId) {
    return api.getFormsOverview(guildId);
  },

  getTicketsOverview(guildId) {
    return api.request(`/api/tickets/${guildId}/overview`);
  },
};

export default ownerApi;
