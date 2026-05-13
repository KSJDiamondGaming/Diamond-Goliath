const path = require('path');

const {
  getRuntimePaths,
} = require('../config/runtimePaths');

const runtimePaths = getRuntimePaths(
  process.env.BOT_MODE || 'DEV'
);

/* ---------------- LOGS ---------------- */

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

  events: {
    moderationActions: true,
    adminActions: true,
    automodActions: true,

    memberJoin: true,
    memberLeave: true,
    memberUpdate: true,

    messageDelete: true,
    messageEdit: true,

    roleCreate: true,
    roleDelete: true,
    roleUpdate: true,

    channelCreate: true,
    channelDelete: true,
    channelUpdate: true,

    voiceJoin: true,
    voiceLeave: true,
    voiceMove: true,
  },
});

/* ---------------- SECURITY ---------------- */

const DEFAULT_SECURITY = Object.freeze({
  enabled: true,

  threatLevel: 'low',

  totalIncidents: 0,
  criticalIncidents: 0,

  lastIncidentAt: null,
  lastIncidentType: null,

  lastLockdownAt: null,
  lastQuarantineAt: null,

  incidents: [],

  lockdown: {
    active: false,

    enabledBy: null,
    enabledAt: null,

    reason: null,
    expiresAt: null,

    channels: [],

    bypassRoleIds: [],
  },

  ownerMonitoring: {
    enabled: true,
    webhookMirrorEnabled: true,
  },
});

/* ---------------- SERVER BACKUPS ---------------- */

const DEFAULT_SERVER_BACKUPS = Object.freeze({
  enabled: true,

  lastBackupId: null,
  lastBackupAt: null,
  lastBackupBy: null,
  lastBackupReason: null,

  backupCount: 0,
  latestBackup: null,

  storage: {
    provider: 'google_drive_desktop',

    path:
      process.env.SERVER_BACKUP_DIR ||
      runtimePaths.backups,

    restoreRequiresSupport: true,
  },

  retention: {
    maxBackups: Number(
      process.env.SERVER_BACKUP_RETENTION || 4
    ),

    autoCleanup: true,
  },
});

/* ---------------- EMBED DEFAULTS ---------------- */

const DEFAULT_EMBED_DEFAULTS = Object.freeze({
  welcome: null,
  leave: null,
  rules: null,
  announcement: null,
  suggestion: null,
  giveaway: null,
  update: null,
  event: null,
  warning: null,
});

/* ---------------- GUILD DATA ---------------- */

const DEFAULT_GUILD_DATA = Object.freeze({
  guildId: null,
  guildName: null,

  updatedAt: null,

  general: {
    enabled: true,
    prefix: '!',
    timezone: 'Europe/London',
  },

  modules: {},

  automod: {},
  moderation: {},
  purge: {},

  logs: DEFAULT_LOGS,
  security: DEFAULT_SECURITY,

  serverBackups: DEFAULT_SERVER_BACKUPS,

  stats: {},
  suggestions: {},
  polls: {},

  roles: {},
  birthdays: {},
  tempVoice: {},

  tickets: {},
  giveaways: {},

  warnings: {},
  cases: {},

  welcome: {},
  leave: {},

  reactionRoles: {},

  autoRoles: {
    enabled: false,
    roleIds: [],
  },

  staffRoles: {
    roleIds: [],
  },

  modRoles: {
    roleIds: [],
  },

  embedPresets: {},
  embedDefaults: DEFAULT_EMBED_DEFAULTS,
});

module.exports = {
  DEFAULT_GUILD_DATA,
  DEFAULT_LOGS,
  DEFAULT_SECURITY,
  DEFAULT_SERVER_BACKUPS,
  DEFAULT_EMBED_DEFAULTS,
};