// src/modules/tickets/ticketTimeline.js

const crypto = require('crypto');

const {
  TICKET_TIMELINE_EVENTS = {},
} = require('./ticketDefaults');

const {
  getTicket,
  updateTicket,
} = require('./ticketStore');

const TIMELINE_EVENTS = Object.freeze({
  CREATED: TICKET_TIMELINE_EVENTS.CREATED || 'ticket_created',
  CLAIMED: TICKET_TIMELINE_EVENTS.CLAIMED || 'ticket_claimed',
  CLOSED: TICKET_TIMELINE_EVENTS.CLOSED || 'ticket_closed',
  REOPENED: TICKET_TIMELINE_EVENTS.REOPENED || 'ticket_reopened',
  ARCHIVED: TICKET_TIMELINE_EVENTS.ARCHIVED || 'ticket_archived',
  DELETED: TICKET_TIMELINE_EVENTS.DELETED || 'ticket_deleted',

  STATUS_CHANGED:
    TICKET_TIMELINE_EVENTS.STATUS_CHANGED || 'ticket_status_changed',

  PRIORITY_CHANGED:
    TICKET_TIMELINE_EVENTS.PRIORITY_CHANGED || 'ticket_priority_changed',

  ASSIGNED: TICKET_TIMELINE_EVENTS.ASSIGNED || 'ticket_assigned',
  USER_ADDED: TICKET_TIMELINE_EVENTS.USER_ADDED || 'ticket_user_added',
  USER_REMOVED: TICKET_TIMELINE_EVENTS.USER_REMOVED || 'ticket_user_removed',

  NOTE_ADDED: TICKET_TIMELINE_EVENTS.NOTE_ADDED || 'ticket_note_added',

  DISCORD_CHANNEL_CREATED:
    TICKET_TIMELINE_EVENTS.DISCORD_CHANNEL_CREATED ||
    'discord_channel_created',

  DISCORD_CHANNEL_CLOSED:
    TICKET_TIMELINE_EVENTS.DISCORD_CHANNEL_CLOSED ||
    'discord_channel_closed',

  DISCORD_CHANNEL_REOPENED:
    TICKET_TIMELINE_EVENTS.DISCORD_CHANNEL_REOPENED ||
    'discord_channel_reopened',

  DISCORD_CHANNEL_ARCHIVED:
    TICKET_TIMELINE_EVENTS.DISCORD_CHANNEL_ARCHIVED ||
    'discord_channel_archived',

  DISCORD_CHANNEL_DELETED:
    TICKET_TIMELINE_EVENTS.DISCORD_CHANNEL_DELETED ||
    'discord_channel_deleted',

  TRANSCRIPT_CREATED:
    TICKET_TIMELINE_EVENTS.TRANSCRIPT_CREATED ||
    'ticket_transcript_created',

  TRANSCRIPT_UPLOADED:
    TICKET_TIMELINE_EVENTS.TRANSCRIPT_UPLOADED ||
    'ticket_transcript_uploaded',

  SYSTEM: TICKET_TIMELINE_EVENTS.SYSTEM || 'ticket_system',
});

function now() {
  return new Date().toISOString();
}

function createTimelineEntry({
  type = TIMELINE_EVENTS.SYSTEM,
  actorId = null,
  message = '',
  metadata = {},
  severity = 'info',
  source = 'tickets',
} = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    actorId,
    message,
    metadata,
    severity,
    source,
    createdAt: now(),
  };
}

function addTimelineEntry(guildId, ticketId, entryData = {}) {
  if (!guildId || !ticketId) {
    return null;
  }

  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return null;
  }

  const entry = createTimelineEntry(entryData);

  const timeline = Array.isArray(ticket.timeline)
    ? [...ticket.timeline]
    : [];

  timeline.push(entry);

  updateTicket(guildId, ticketId, {
    timeline,
  });

  return entry;
}

function addSystemEntry(
  guildId,
  ticketId,
  type,
  message,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: type || TIMELINE_EVENTS.SYSTEM,
    actorId: null,
    message,
    metadata,
    source: 'system',
  });
}

function addUserEntry(
  guildId,
  ticketId,
  actorId,
  type,
  message,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type,
    actorId,
    message,
    metadata,
    source: 'user',
  });
}

function getTimeline(guildId, ticketId) {
  const ticket = getTicket(guildId, ticketId);

  if (!ticket) {
    return [];
  }

  return Array.isArray(ticket.timeline)
    ? ticket.timeline
    : [];
}

function clearTimeline(guildId, ticketId) {
  return updateTicket(guildId, ticketId, {
    timeline: [],
  });
}

function addTicketCreatedEntry(
  guildId,
  ticketId,
  actorId = null,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.CREATED,
    actorId,
    message: 'Ticket created.',
    metadata,
  });
}

function addTicketClaimedEntry(
  guildId,
  ticketId,
  actorId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.CLAIMED,
    actorId,
    message: 'Ticket claimed.',
    metadata,
  });
}

function addTicketClosedEntry(
  guildId,
  ticketId,
  actorId,
  reason = null,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.CLOSED,
    actorId,
    message: reason || 'Ticket closed.',
    metadata: {
      reason,
      ...metadata,
    },
  });
}

function addTicketReopenedEntry(
  guildId,
  ticketId,
  actorId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.REOPENED,
    actorId,
    message: 'Ticket reopened.',
    metadata,
  });
}

function addTicketArchivedEntry(
  guildId,
  ticketId,
  actorId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.ARCHIVED,
    actorId,
    message: 'Ticket archived.',
    metadata,
  });
}

function addTicketDeletedEntry(
  guildId,
  ticketId,
  actorId,
  reason = null,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.DELETED,
    actorId,
    message: reason || 'Ticket deleted.',
    metadata: {
      reason,
      ...metadata,
    },
    severity: 'warning',
  });
}

function addStatusChangeEntry(
  guildId,
  ticketId,
  actorId,
  oldStatus,
  newStatus,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.STATUS_CHANGED,
    actorId,
    message: `Status changed from "${oldStatus}" to "${newStatus}".`,
    metadata: {
      oldStatus,
      newStatus,
      ...metadata,
    },
  });
}

function addPriorityChangeEntry(
  guildId,
  ticketId,
  actorId,
  oldPriority,
  newPriority,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.PRIORITY_CHANGED,
    actorId,
    message: `Priority changed from "${oldPriority}" to "${newPriority}".`,
    metadata: {
      oldPriority,
      newPriority,
      ...metadata,
    },
  });
}

function addAssignmentEntry(
  guildId,
  ticketId,
  actorId,
  assignedUserId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.ASSIGNED,
    actorId,
    message: `Assigned to ${assignedUserId}.`,
    metadata: {
      assignedUserId,
      ...metadata,
    },
  });
}

function addUserAddedEntry(
  guildId,
  ticketId,
  actorId,
  userId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.USER_ADDED,
    actorId,
    message: `Added user ${userId}.`,
    metadata: {
      userId,
      ...metadata,
    },
  });
}

function addUserRemovedEntry(
  guildId,
  ticketId,
  actorId,
  userId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.USER_REMOVED,
    actorId,
    message: `Removed user ${userId}.`,
    metadata: {
      userId,
      ...metadata,
    },
  });
}

function addNoteEntry(
  guildId,
  ticketId,
  actorId,
  note,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type: TIMELINE_EVENTS.NOTE_ADDED,
    actorId,
    message: note,
    metadata,
  });
}

function addDiscordChannelEntry(
  guildId,
  ticketId,
  type,
  channelId,
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type,
    actorId: null,
    message: `Discord ticket channel updated: ${channelId}`,
    metadata: {
      channelId,
      ...metadata,
    },
    source: 'discord',
  });
}

function addTranscriptEntry(
  guildId,
  ticketId,
  actorId,
  type,
  transcript = {},
  metadata = {}
) {
  return addTimelineEntry(guildId, ticketId, {
    type,
    actorId,
    message: 'Ticket transcript generated.',
    metadata: {
      transcript,
      ...metadata,
    },
  });
}

module.exports = {
  TIMELINE_EVENTS,

  createTimelineEntry,

  addTimelineEntry,

  addSystemEntry,
  addUserEntry,

  getTimeline,
  clearTimeline,

  addTicketCreatedEntry,
  addTicketClaimedEntry,
  addTicketClosedEntry,
  addTicketReopenedEntry,
  addTicketArchivedEntry,
  addTicketDeletedEntry,

  addStatusChangeEntry,
  addPriorityChangeEntry,
  addAssignmentEntry,

  addUserAddedEntry,
  addUserRemovedEntry,

  addNoteEntry,
  addDiscordChannelEntry,
  addTranscriptEntry,
};