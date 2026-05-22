// src/modules/tickets/ticketSocketEvents.js

const TICKET_SOCKET_EVENTS = Object.freeze({
  CREATED: 'ticket:created',
  UPDATED: 'ticket:updated',
  DELETED: 'ticket:deleted',

  CLAIMED: 'ticket:claimed',
  ASSIGNED: 'ticket:assigned',

  CLOSED: 'ticket:closed',
  REOPENED: 'ticket:reopened',
  ARCHIVED: 'ticket:archived',

  STATUS_CHANGED: 'ticket:status_changed',
  PRIORITY_CHANGED: 'ticket:priority_changed',

  NOTE_ADDED: 'ticket:note_added',
  TIMELINE_ADDED: 'ticket:timeline_added',

  CHANNEL_CREATED: 'ticket:channel_created',
  CHANNEL_CLOSED: 'ticket:channel_closed',
  CHANNEL_REOPENED: 'ticket:channel_reopened',
  CHANNEL_ARCHIVED: 'ticket:channel_archived',
  CHANNEL_DELETED: 'ticket:channel_deleted',

  PANEL_UPDATED: 'ticket:panel_updated',
  SETTINGS_UPDATED: 'ticket:settings_updated',

  TRANSCRIPT_CREATED: 'ticket:transcript_created',
  TRANSCRIPT_UPLOADED: 'ticket:transcript_uploaded',
});

function getGuildRoom(guildId) {
  return `guild:${guildId}`;
}

function emitTicketEvent(io, guildId, event, payload = {}) {
  if (!io || !guildId || !event) {
    return false;
  }

  try {
    io.to(getGuildRoom(guildId)).emit(event, {
      guildId,
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    });

    return true;
  } catch (error) {
    console.error(
      '[TicketSocketEvents] Failed to emit socket event:',
      error
    );

    return false;
  }
}

function emitTicketCreated(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CREATED,
    { ticket }
  );
}

function emitTicketUpdated(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.UPDATED,
    { ticket }
  );
}

function emitTicketDeleted(io, guildId, ticketId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.DELETED,
    { ticketId }
  );
}

function emitTicketClaimed(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CLAIMED,
    { ticket }
  );
}

function emitTicketAssigned(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.ASSIGNED,
    { ticket }
  );
}

function emitTicketClosed(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CLOSED,
    { ticket }
  );
}

function emitTicketReopened(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.REOPENED,
    { ticket }
  );
}

function emitTicketArchived(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.ARCHIVED,
    { ticket }
  );
}

function emitTicketStatusChanged(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.STATUS_CHANGED,
    { ticket }
  );
}

function emitTicketPriorityChanged(io, guildId, ticket) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.PRIORITY_CHANGED,
    { ticket }
  );
}

function emitTicketTimelineAdded(io, guildId, ticketId, entry) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.TIMELINE_ADDED,
    {
      ticketId,
      entry,
    }
  );
}

function emitTicketNoteAdded(io, guildId, ticketId, note) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.NOTE_ADDED,
    {
      ticketId,
      note,
    }
  );
}

function emitTicketChannelCreated(io, guildId, ticketId, channelId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CHANNEL_CREATED,
    {
      ticketId,
      channelId,
    }
  );
}

function emitTicketChannelClosed(io, guildId, ticketId, channelId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CHANNEL_CLOSED,
    {
      ticketId,
      channelId,
    }
  );
}

function emitTicketChannelReopened(io, guildId, ticketId, channelId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CHANNEL_REOPENED,
    {
      ticketId,
      channelId,
    }
  );
}

function emitTicketChannelArchived(io, guildId, ticketId, channelId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CHANNEL_ARCHIVED,
    {
      ticketId,
      channelId,
    }
  );
}

function emitTicketChannelDeleted(io, guildId, ticketId, channelId) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.CHANNEL_DELETED,
    {
      ticketId,
      channelId,
    }
  );
}

function emitTicketPanelUpdated(io, guildId, panel) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.PANEL_UPDATED,
    { panel }
  );
}

function emitTicketSettingsUpdated(io, guildId, settings) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.SETTINGS_UPDATED,
    { settings }
  );
}

function emitTranscriptCreated(io, guildId, ticketId, transcript) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.TRANSCRIPT_CREATED,
    {
      ticketId,
      transcript,
    }
  );
}

function emitTranscriptUploaded(io, guildId, ticketId, upload) {
  return emitTicketEvent(
    io,
    guildId,
    TICKET_SOCKET_EVENTS.TRANSCRIPT_UPLOADED,
    {
      ticketId,
      upload,
    }
  );
}

/**
 * General helper for future dashboard/API use.
 */
function emitForTicket(io, ticket, event, payload = {}) {
  if (!ticket?.guildId) return false;

  return emitTicketEvent(
    io,
    ticket.guildId,
    event,
    {
      ticketId: ticket.ticketId,
      ticket,
      ...payload,
    }
  );
}

module.exports = {
  TICKET_SOCKET_EVENTS,

  getGuildRoom,
  emitTicketEvent,
  emitForTicket,

  emitTicketCreated,
  emitTicketUpdated,
  emitTicketDeleted,

  emitTicketClaimed,
  emitTicketAssigned,

  emitTicketClosed,
  emitTicketReopened,
  emitTicketArchived,

  emitTicketStatusChanged,
  emitTicketPriorityChanged,

  emitTicketTimelineAdded,
  emitTicketNoteAdded,

  emitTicketChannelCreated,
  emitTicketChannelClosed,
  emitTicketChannelReopened,
  emitTicketChannelArchived,
  emitTicketChannelDeleted,

  emitTicketPanelUpdated,
  emitTicketSettingsUpdated,

  emitTranscriptCreated,
  emitTranscriptUploaded,
};