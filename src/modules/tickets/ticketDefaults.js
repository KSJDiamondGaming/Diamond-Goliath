// src/modules/tickets/ticketDefaults.js

const crypto = require('crypto');

function now() {
  return new Date().toISOString();
}

const TICKET_TYPES = Object.freeze({
  SUPPORT: 'support',
  APPEAL: 'appeal',
  APPLICATION: 'application',
  REPORT: 'report',
  SECURITY_REVIEW: 'security_review',
  STAFF_REVIEW: 'staff_review',
  GENERAL: 'general',
});

const TICKET_STATUS = Object.freeze({
  OPEN: 'open',
  CLAIMED: 'claimed',
  WAITING_USER: 'waiting_user',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  DENIED: 'denied',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
});

const ACTIVE_TICKET_STATUSES =
  Object.freeze([
    TICKET_STATUS.OPEN,
    TICKET_STATUS.CLAIMED,
    TICKET_STATUS.WAITING_USER,
    TICKET_STATUS.IN_REVIEW,
    TICKET_STATUS.APPROVED,
    TICKET_STATUS.DENIED,
  ]);

const CLOSED_TICKET_STATUSES =
  Object.freeze([
    TICKET_STATUS.CLOSED,
    TICKET_STATUS.ARCHIVED,
  ]);

const TICKET_PRIORITY =
  Object.freeze({
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent',
  });

const TICKET_SOURCE =
  Object.freeze({
    DISCORD_PANEL:
      'discord_panel',

    DISCORD_COMMAND:
      'discord_command',

    DISCORD_MODAL:
      'discord_modal',

    DASHBOARD:
      'dashboard',

    FORM_SUBMISSION:
      'form_submission',

    MODERATION_CASE:
      'moderation_case',

    SECURITY_INCIDENT:
      'security_incident',

    SYSTEM:
      'system',
  });

const TICKET_TIMELINE_EVENTS =
  Object.freeze({
    CREATED:
      'ticket_created',

    CLAIMED:
      'ticket_claimed',

    CLOSED:
      'ticket_closed',

    REOPENED:
      'ticket_reopened',

    ARCHIVED:
      'ticket_archived',

    DELETED:
      'ticket_deleted',

    STATUS_CHANGED:
      'ticket_status_changed',

    PRIORITY_CHANGED:
      'ticket_priority_changed',

    ASSIGNED:
      'ticket_assigned',

    USER_ADDED:
      'ticket_user_added',

    USER_REMOVED:
      'ticket_user_removed',

    NOTE_ADDED:
      'ticket_note_added',

    STAFF_ACTIVITY:
      'ticket_staff_activity',

    DISCORD_CHANNEL_CREATED:
      'discord_channel_created',

    DISCORD_CHANNEL_CLOSED:
      'discord_channel_closed',

    DISCORD_CHANNEL_REOPENED:
      'discord_channel_reopened',

    DISCORD_CHANNEL_ARCHIVED:
      'discord_channel_archived',

    DISCORD_CHANNEL_DELETED:
      'discord_channel_deleted',

    TRANSCRIPT_CREATED:
      'ticket_transcript_created',

    TRANSCRIPT_UPLOADED:
      'ticket_transcript_uploaded',

    SYSTEM:
      'ticket_system',
  });

const DEFAULT_TICKET_SETTINGS =
  Object.freeze({
    enabled: true,

    numbering: {
      nextNumber: 1,
      prefix: 'TICKET',
      padding: 4,
    },

    tickets: {
      allowMultipleTickets: true,

      oneActivePerType: true,

      defaultPriority:
        TICKET_PRIORITY.NORMAL,

      defaultStatus:
        TICKET_STATUS.OPEN,

      cooldownMs:
        60 * 1000,

      maxActiveTicketsPerUser: 5,

      autoArchiveClosedTickets: false,

      autoArchiveHours: 72,
    },

    transcripts: {
      enabled: true,

      saveHtml: true,
      saveJson: true,

      uploadToDiscord: true,

      includeAttachments: true,
      includeEmbeds: true,

      includeImages: true,

      autoGenerateOnClose: true,

      autoGenerateOnArchive: true,

      useEnterpriseHtml: true,
    },

    analytics: {
      enabled: true,

      realtime: true,

      storeTimelineAnalytics: true,

      trackClaimTimes: true,

      trackResponseTimes: true,

      trackCloseTimes: true,
    },

    security: {
      antiSpam: true,

      antiDuplicateTickets: true,

      blockBlacklistedUsers: true,

      logStaffActions: true,

      requireDeleteConfirmation: true,
    },

    recovery: {
      restorePanelsOnBoot: true,

      restoreActiveTicketsOnBoot: true,

      restoreCachesOnBoot: true,

      restoreRealtimeStateOnBoot: true,
    },

    dashboard: {
      realtimeEnabled: true,

      allowRealtimeSync: true,

      enableLivePanelUpdates: true,

      enableAnalyticsSync: true,
    },

    discord: {
      categoryId: null,

      archiveCategoryId: null,

      logsChannelId: null,

      transcriptsChannelId: null,
    },

    permissions: {
      allowCreatorView: true,

      allowUserClose: false,

      staffRoleIds: [],

      managerRoleIds: [],

      viewerRoleIds: [],
    },

    metadata: {},

    createdAt: now(),
    updatedAt: now(),
  });

const DEFAULT_TICKET_PANEL =
  Object.freeze({
    enabled: true,

    deployed: false,

    status: 'draft',

    panelId: null,

    /*
    ==========================================
    PANEL INFO
    ==========================================
    */

    name:
      'Support Panel',

    title:
      'Open a Ticket',

    description:
      'Need help? Open a ticket and our staff team will assist you.',

    /*
    ==========================================
    APPEARANCE
    ==========================================
    */

    appearance: {
      title:
        'Open a Ticket',

      description:
        'Need help? Open a ticket and our staff team will assist you.',

      color:
        '#5865F2',

      buttonLabel:
        'Open Ticket',

      buttonEmoji:
        '🎫',

      imageUrl: null,

      thumbnailUrl: null,

      footerText:
        'KSJ Goliath Tickets',
    },

    buttonLabel:
      'Open Ticket',

    buttonStyle:
      'Primary',

    emoji: '🎫',

    color:
      '#5865F2',

    /*
    ==========================================
    TICKET CONFIG
    ==========================================
    */

    ticketType:
      TICKET_TYPES.SUPPORT,

    ticketPriority:
      TICKET_PRIORITY.NORMAL,

    /*
    ==========================================
    OUTPUT CHANNELS
    ==========================================
    */

    panelChannelId: null,

    outputCategoryId: null,

    archiveCategoryId: null,

    logsChannelId: null,

    transcriptsChannelId: null,

    /*
    ==========================================
    DEPLOYMENT
    ==========================================
    */

    deployChannelId: null,

    deployMessageId: null,

    deployedAt: null,

    deployedById: null,

    lastDeployAt: null,

    lastDeployById: null,

    /*
    ==========================================
    ROLE ACCESS
    ==========================================
    */

    staffRoleIds: [],

    managerRoleIds: [],

    viewerRoleIds: [],

    allowedRoleIds: [],

    blockedRoleIds: [],

    /*
    ==========================================
    TICKET BEHAVIOUR
    ==========================================
    */

    allowUserClose: false,

    allowUserAddMembers: false,

    autoAssignStaff: false,

    autoCloseEnabled: false,

    autoCloseHours: 72,

    autoArchiveEnabled: false,

    autoArchiveHours: 72,

    createPrivateChannel: true,

    useThreads: false,

    /*
    ==========================================
    DUPLICATE/SPAM PROTECTION
    ==========================================
    */

    oneActivePerType: true,

    cooldownMs:
      60 * 1000,

    /*
    ==========================================
    NOTIFICATIONS
    ==========================================
    */

    dmCreatorOnOpen: true,

    dmCreatorOnClose: true,

    notifyStaffOnOpen: true,

    /*
    ==========================================
    DISCORD MESSAGE
    ==========================================
    */

    messageId: null,

    /*
    ==========================================
    FORM LINKING
    ==========================================
    */

    linkedFormId: null,

    /*
    ==========================================
    ANALYTICS
    ==========================================
    */

    analytics: {
      opens: 0,

      closes: 0,

      claims: 0,

      archives: 0,

      averageCloseTimeMs: 0,
    },

    /*
    ==========================================
    METADATA
    ==========================================
    */

    tags: [],

    metadata: {},

    createdAt: null,

    updatedAt: null,
  });

function generateDisplayId({
  prefix = 'TICKET',
  number = 1,
  padding = 4,
} = {}) {
  return `${prefix}-${String(
    number
  ).padStart(
    padding,
    '0'
  )}`;
}

function createDefaultTicket({
  guildId = null,

  ticketId =
    crypto.randomUUID(),

  number = 1,

  creatorId = null,

  type =
    TICKET_TYPES.SUPPORT,

  title =
    'Untitled Ticket',

  description = '',

  status =
    TICKET_STATUS.OPEN,

  priority =
    TICKET_PRIORITY.NORMAL,

  source =
    TICKET_SOURCE.SYSTEM,

  sourceId = null,

  discordChannelId = null,

  claimedById = null,

  assignedStaffIds = [],

  allowedUserIds = [],

  formSubmissionId = null,

  moderationCaseId = null,

  securityIncidentId = null,

  tags = [],

  metadata = {},
} = {}) {
  const createdAt = now();

  return {
    ticketId,

    displayId:
      generateDisplayId({
        number,
      }),

    number,

    guildId,

    creatorId,

    type,

    title,

    description,

    status,

    priority,

    source,
    sourceId,

    discordChannelId,

    claimedById,

    claimedAt: null,

    reopenedById: null,
    reopenedAt: null,

    assignedStaffIds,

    allowedUserIds,

    formSubmissionId,

    moderationCaseId,

    securityIncidentId,

    notes: [],

    timeline: [],

    tags,

    metadata,

    analytics: {
      firstResponseAt: null,

      averageResponseTimeMs: 0,

      totalMessages: 0,

      totalAttachments: 0,
    },

    transcript: null,

    transcriptUrl: null,

    transcriptMessageId: null,

    transcriptChannelId: null,

    createdAt,
    updatedAt: createdAt,

    statusChangedAt:
      createdAt,

    closedAt: null,
    closedById: null,
    closeReason: null,

    archivedAt: null,
    archivedById: null,
    archiveReason: null,

    deletedAt: null,
    deletedById: null,

    deletedReason: null,
  };
}

module.exports = {
  TICKET_TYPES,

  TICKET_STATUS,
  ACTIVE_TICKET_STATUSES,
  CLOSED_TICKET_STATUSES,

  TICKET_PRIORITY,

  TICKET_SOURCE,

  TICKET_TIMELINE_EVENTS,

  DEFAULT_TICKET_SETTINGS,

  DEFAULT_TICKET_PANEL,

  createDefaultTicket,
  generateDisplayId,
};