import { api } from './apiClient.js';

function cleanGuildId(guildId = '') {
  return String(guildId || '')
    .split(':')
    .pop()
    .trim();
}

export const ownerApi = {
  getGuilds() {
    return api.getOwnerGuilds();
  },

  getRuntime() {
    return api.getPlatformRuntime();
  },

  getSecurity(guildId) {
    return api.getOwnerSecurity(cleanGuildId(guildId));
  },

  getRuntimeDetails(guildId) {
    return api.getOwnerRuntime(cleanGuildId(guildId));
  },

  getFormsOverview(guildId) {
    return api.getFormsOverview(cleanGuildId(guildId));
  },

  getFormsWorkflowOverview(guildId) {
    return api.getFormsWorkflowOverview(cleanGuildId(guildId));
  },

  getFormSubmissionWorkflow(guildId, submissionId) {
    return api.getFormSubmissionWorkflow(cleanGuildId(guildId), submissionId);
  },

  getTicketsOverview(guildId) {
    return api.getTicketOverview(cleanGuildId(guildId));
  },

  getTickets(guildId) {
    return api.getTickets(cleanGuildId(guildId));
  },

  runTicketRecovery(guildId, createMissingChannels = false) {
    return api.runTicketRecovery(cleanGuildId(guildId), createMissingChannels);
  },

  scanTicketRecovery(guildId) {
    return api.runTicketRecoveryScan(cleanGuildId(guildId));
  },

  recreateMissingTicketChannels(guildId) {
    return api.recreateMissingTicketChannels(cleanGuildId(guildId));
  },
};

export default ownerApi;
