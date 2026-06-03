// src/modules/tickets/ticketDefaults.js

'use strict';

/*
|--------------------------------------------------------------------------
| Ticket Types
|--------------------------------------------------------------------------
*/

const TICKET_TYPES = {
  SUPPORT: 'support',
  APPEAL: 'appeal',
  REPORT: 'report',
  APPLICATION: 'application',
  STAFF: 'staff',
  OTHER: 'other',
};

/*
|--------------------------------------------------------------------------
| Ticket Priority
|--------------------------------------------------------------------------
*/

const TICKET_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

/*
|--------------------------------------------------------------------------
| Ticket Status
|--------------------------------------------------------------------------
*/

const TICKET_STATUS = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  WAITING_USER: 'waiting_user',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  DENIED: 'denied',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
};

/*
|--------------------------------------------------------------------------
| Ticket Sources
|--------------------------------------------------------------------------
*/

const TICKET_SOURCE = {
  DISCORD_PANEL: 'discord_panel',
  DISCORD_COMMAND: 'discord_command',
  WEB_PORTAL: 'web_portal',
  FORM_SUBMISSION: 'form_submission',
  API: 'api',
  AUTOMATION: 'automation',
};

/*
|--------------------------------------------------------------------------
| SLA Defaults
|--------------------------------------------------------------------------
*/

const DEFAULT_SLA = {
  low: 1440,     // 24h
  normal: 720,   // 12h
  high: 120,     // 2h
  urgent: 15,    // 15m
};

/*
|--------------------------------------------------------------------------
| Reminder Defaults
|--------------------------------------------------------------------------
*/

const DEFAULT_REMINDERS = {
  enabled: true,

  repeat: true,
  repeatMinutes: 60,

  escalationMinutes: 60,

  pingRoleIds: [],
  escalationRoleIds: [],
};

/*
|--------------------------------------------------------------------------
| Default Ticket Settings
|--------------------------------------------------------------------------
*/

const DEFAULT_TICKET_SETTINGS = {
  enabled: true,

  numbering: {
    nextNumber: 1,
    prefix: 'ticket',
    padding: 4,
  },

  tickets: {
    enabled: true,

    createPrivateChannels: true,

    maxActiveTicketsPerUser: 5,

    defaultPriority: TICKET_PRIORITY.LOW,

    defaultCooldownMs: 60 * 1000,

    allowUserClose: false,
    allowUserAddMembers: false,
  },

  permissions: {
    administratorOverride: true,

    staffRoles: [],
    managerRoles: [],
    viewerRoles: [],
  },

  transcripts: {
    enabled: true,

    saveOnClose: true,
    saveOnArchive: true,
    saveOnDelete: true,

    transcriptChannelId: null,
  },

  analytics: {
    enabled: true,
  },
};

/*
|--------------------------------------------------------------------------
| Default Ticket Panel
|--------------------------------------------------------------------------
*/

const DEFAULT_TICKET_PANEL = {
  enabled: true,

  deployed: false,
  status: 'draft',

  name: 'Support Panel',

  ticketType: TICKET_TYPES.SUPPORT,
  ticketPriority: TICKET_PRIORITY.LOW,

  /*
  |--------------------------------------------------------------------------
  | Limits
  |--------------------------------------------------------------------------
  */

  maxOpenTicketsPerUser: 2,

  maxActiveTicketsPerUser: 2,

  oneActivePerType: true,

  cooldownMs: 60 * 1000,

  /*
  |--------------------------------------------------------------------------
  | Routing
  |--------------------------------------------------------------------------
  */

  outputCategoryId: null,
  archiveCategoryId: null,

  logsChannelId: null,
  transcriptsChannelId: null,

  /*
  |--------------------------------------------------------------------------
  | Roles
  |--------------------------------------------------------------------------
  */

  staffRoleIds: [],
  managerRoleIds: [],
  viewerRoleIds: [],

  allowedRoleIds: [],
  blockedRoleIds: [],

  /*
  |--------------------------------------------------------------------------
  | Behaviour
  |--------------------------------------------------------------------------
  */

  createPrivateChannel: true,

  useThreads: false,

  autoAssignStaff: false,

  allowUserClose: false,
  allowUserAddMembers: false,

  autoCloseEnabled: false,
  autoCloseHours: 72,

  autoArchiveEnabled: false,
  autoArchiveHours: 72,

  priorityIndicators: true,

  dmCreatorOnOpen: true,
  dmCreatorOnClose: true,

  notifyStaffOnOpen: true,

  /*
  |--------------------------------------------------------------------------
  | SLA
  |--------------------------------------------------------------------------
  */

  sla: {
    ...DEFAULT_SLA,
  },

  /*
  |--------------------------------------------------------------------------
  | Reminders
  |--------------------------------------------------------------------------
  */

  reminders: {
    ...DEFAULT_REMINDERS,
  },

  /*
  |--------------------------------------------------------------------------
  | Appearance
  |--------------------------------------------------------------------------
  */

  appearance: {
    title: 'Need Support?',
    description:
      'Press the button below to open a private support ticket.',

    color: '#5865F2',

    buttonLabel: 'Open Support Ticket',
    buttonEmoji: '🎫',

    imageUrl: null,
    thumbnailUrl: null,

    footerText: 'Goliath • Ticket System',
  },

  buttonStyle: 'Primary',

  /*
  |--------------------------------------------------------------------------
  | Analytics
  |--------------------------------------------------------------------------
  */

  analytics: {
    opens: 0,
    closes: 0,
    claims: 0,
    archives: 0,
    averageCloseTimeMs: 0,
  },

  metadata: {},
};

/*
|--------------------------------------------------------------------------
| Utility Helpers
|--------------------------------------------------------------------------
*/

function createDefaultPanel(overrides = {}) {
  return {
    ...DEFAULT_TICKET_PANEL,

    ...overrides,

    appearance: {
      ...DEFAULT_TICKET_PANEL.appearance,
      ...(overrides.appearance || {}),
    },

    sla: {
      ...DEFAULT_SLA,
      ...(overrides.sla || {}),
    },

    reminders: {
      ...DEFAULT_REMINDERS,
      ...(overrides.reminders || {}),
    },

    analytics: {
      ...DEFAULT_TICKET_PANEL.analytics,
      ...(overrides.analytics || {}),
    },

    metadata: {
      ...DEFAULT_TICKET_PANEL.metadata,
      ...(overrides.metadata || {}),
    },
  };
}

module.exports = {
  TICKET_TYPES,
  TICKET_PRIORITY,
  TICKET_STATUS,
  TICKET_SOURCE,

  DEFAULT_SLA,
  DEFAULT_REMINDERS,

  DEFAULT_TICKET_SETTINGS,
  DEFAULT_TICKET_PANEL,

  createDefaultPanel,
};