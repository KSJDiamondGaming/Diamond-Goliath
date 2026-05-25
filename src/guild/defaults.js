const { getRuntimePaths } = require('../config/runtimePaths');

const runtimePaths = getRuntimePaths(process.env.BOT_MODE || 'DEV');

const DEFAULT_TICKETS = Object.freeze({
  settings: {
    enabled: true,

    numbering: {
      nextNumber: 1,
      prefix: 'ticket',
      padding: 4,
    },

    tickets: {
      allowMultipleTickets: true,
      oneActivePerType: true,
      defaultPriority: 'normal',
      defaultStatus: 'open',
      cooldownMs: 60 * 1000,
      maxActiveTicketsPerUser: 5,
    },

    permissions: {
      allowCreatorView: true,
      allowUserClose: false,
      staffRoleIds: [],
      managerRoleIds: [],
      viewerRoleIds: [],
    },

    discord: {
      categoryId: null,
      archiveCategoryId: null,
      logsChannelId: null,
      transcriptsChannelId: null,
    },

    transcripts: {
      enabled: true,
      saveHtml: true,
      saveJson: true,
      uploadToDiscord: true,
      includeAttachments: true,
      includeEmbeds: true,
      autoGenerateOnClose: true,
      autoGenerateOnArchive: true,
    },

    dashboard: {
      realtimeEnabled: true,
      allowRealtimeSync: true,
    },
  },

  panels: [],
  tickets: [],
  analytics: {},
});