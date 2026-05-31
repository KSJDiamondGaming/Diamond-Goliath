const { getRuntimePaths } = require('../config/runtimePaths');

const runtimePaths = getRuntimePaths(process.env.BOT_MODE || 'DEV');

const DEFAULT_GENERAL_SETTINGS = Object.freeze({
  prefix: '/',
  appealUrl: '',
  dashboardEnabled: true,

  managerRoleIds: [],
  dashboardAccessRoleIds: [],
  commandManagerRoleIds: [],
  restrictedChannelIds: [],

  commandNotFoundEnabled: true,
  wrongCommandUsageEnabled: true,
  noCommandPermissionsEnabled: true,
  disabledInChannelEnabled: false,
  commandCooldownEnabled: true,
  instantDeleteDataEnabled: false,
});

const DEFAULT_LOGS = Object.freeze({
  enabled: true,

  channels: {
    general: null,
    moderation: null,
    admin: null,
    automod: null,
    member: null,
    messageDelete: null,
    messageEdit: null,
    voice: null,
  },

  events: {},
});

const DEFAULT_SECURITY = Object.freeze({
  enabled: true,
  threatLevel: 'low',
  totalIncidents: 0,
  criticalIncidents: 0,
  incidents: [],

  lockdown: {
    active: false,
    channels: [],
    bypassRoleIds: [],
  },

  ownerMonitoring: {
    enabled: true,
    webhookMirrorEnabled: true,
  },
});

const DEFAULT_SERVER_BACKUPS = Object.freeze({
  enabled: true,

  storage: {
    path: process.env.SERVER_BACKUP_DIR || runtimePaths.backups,
  },

  retention: {
    maxBackups: Number(process.env.SERVER_BACKUP_RETENTION || 4),
    autoCleanup: true,
  },
});

const DEFAULT_EMBED = Object.freeze({
  title: '',
  description: '',
  color: '#5865F2',

  author: {
    name: '',
    iconURL: '',
    url: '',
  },

  thumbnailURL: '',
  imageURL: '',

  footer: {
    text: '',
    iconURL: '',
  },

  fields: [],
});

const DEFAULT_EMBED_DEFAULTS = Object.freeze({
  welcome: null,
  leave: null,
  logs: null,
  moderation: null,
  tickets: null,
  appeals: null,
  announcements: null,
});

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

const DEFAULT_GUILD_DATA = Object.freeze({
  guildId: null,
  guildName: null,

  createdAt: null,
  updatedAt: null,

  generalSettings: DEFAULT_GENERAL_SETTINGS,
  logs: DEFAULT_LOGS,
  security: DEFAULT_SECURITY,
  serverBackups: DEFAULT_SERVER_BACKUPS,

  embedDefaults: DEFAULT_EMBED_DEFAULTS,
  embedPresets: {},

  embedBuilder: {
    draft: DEFAULT_EMBED,
    templates: {},
  },

  modules: {},

  tickets: DEFAULT_TICKETS,
});

module.exports = {
  DEFAULT_GUILD_DATA,
  DEFAULT_GENERAL_SETTINGS,
  DEFAULT_LOGS,
  DEFAULT_SECURITY,
  DEFAULT_SERVER_BACKUPS,
  DEFAULT_EMBED,
  DEFAULT_EMBED_DEFAULTS,
  DEFAULT_TICKETS,
};