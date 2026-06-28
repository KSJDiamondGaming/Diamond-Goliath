// src/modules/tickets/ticketSocketEvents.js

const EVENTS = Object.freeze({
  TICKET_CREATED: 'ticket_created',
  TICKET_UPDATED: 'ticket_updated',
  TICKET_CLOSED: 'ticket_closed',
  TICKET_REOPENED: 'ticket_reopened',
  TICKET_ARCHIVED: 'ticket_archived',
  TICKET_DELETED: 'ticket_deleted',
  TICKET_CLAIMED: 'ticket_claimed',

  PANEL_CREATED: 'panel_created',
  PANEL_UPDATED: 'panel_updated',
  PANEL_DELETED: 'panel_deleted',
  PANEL_DEPLOYED: 'panel_deployed',

  TIMELINE_ENTRY: 'ticket_timeline_entry',

  ANALYTICS_UPDATED: 'ticket_analytics_updated',
});

const STANDARD_EVENTS = Object.freeze({
  ticket_created: 'ticket.created',
  ticket_updated: 'ticket.updated',
  ticket_closed: 'ticket.closed',
  ticket_reopened: 'ticket.reopened',
  ticket_archived: 'ticket.archived',
  ticket_deleted: 'ticket.deleted',
  ticket_claimed: 'ticket.claimed',

  panel_created: 'panel.created',
  panel_updated: 'panel.updated',
  panel_deleted: 'panel.deleted',
  panel_deployed: 'panel.deployed',

  ticket_timeline_entry: 'ticket.timeline.entry',
  ticket_analytics_updated: 'ticket.analytics.updated',
});

let socketProvider = null;

function now() {
  return new Date().toISOString();
}

function setSocketProvider(provider) {
  socketProvider = provider;
}

function getSocketServer() {
  if (!socketProvider) {
    return null;
  }

  try {
    if (typeof socketProvider === 'function') {
      return socketProvider();
    }

    return socketProvider;
  } catch {
    return null;
  }
}

function getRoomName(guildId) {
  return `guild:${guildId}`;
}

function getStandardEvent(event) {
  return STANDARD_EVENTS[event] || event;
}

function createPayload(type, guildId, data = {}) {
  const event = getStandardEvent(type);

  return {
    type,
    event,

    guildId: String(guildId),

    timestamp: now(),
    updatedAt: now(),

    data,
  };
}

function emitToTargets(io, guildId, legacyEvent, standardEvent, payload) {
  const guildRoom = getRoomName(guildId);

  const emitNames = [
    legacyEvent,
    standardEvent,
  ].filter((eventName, index, list) =>
    eventName && list.indexOf(eventName) === index
  );

  for (const eventName of emitNames) {
    io.to(guildRoom).emit(eventName, payload);
    io.to('goliath:tickets').emit(eventName, payload);
  }

  io.to(guildRoom).emit('guild:update', payload);
  io.to(guildRoom).emit('goliath_realtime_event', payload);
  io.to('goliath:tickets').emit('goliath_realtime_event', payload);
}

function emit(event, guildId, data = {}) {
  const io = getSocketServer();

  const payload = createPayload(
    event,
    guildId,
    data
  );

  /*
   * No socket server yet.
   * Safe noop for early architecture.
   */

  if (!io) {
    return payload;
  }

  try {
    emitToTargets(
      io,
      guildId,
      event,
      payload.event,
      payload
    );
  } catch (error) {
    console.error(
      '[TicketSockets] Failed to emit event:',
      event,
      error
    );
  }

  return payload;
}

function emitForTicket(io, ticket, event, data = {}) {
  if (!io || !ticket?.guildId) {
    return false;
  }

  const payload = createPayload(
    event,
    ticket.guildId,
    {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      status: ticket.status,
      type: ticket.type,
      priority: ticket.priority,
      ...data,
    }
  );

  try {
    emitToTargets(
      io,
      ticket.guildId,
      event,
      payload.event,
      payload
    );

    return payload;
  } catch (error) {
    console.error(
      '[TicketSockets] Failed to emit ticket event:',
      event,
      error
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Ticket Events
|--------------------------------------------------------------------------
*/

function emitTicketCreated(
  guildId,
  ticket
) {
  return emit(
    EVENTS.TICKET_CREATED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      status:
        ticket.status,

      type:
        ticket.type,

      priority:
        ticket.priority,

      creatorId:
        ticket.creatorId,

      panelId:
        ticket.metadata
          ?.panelId || null,

      createdAt:
        ticket.createdAt,
    }
  );
}

function emitTicketUpdated(
  guildId,
  ticket
) {
  return emit(
    EVENTS.TICKET_UPDATED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      status:
        ticket.status,

      updatedAt:
        ticket.updatedAt,
    }
  );
}

function emitTicketClosed(
  guildId,
  ticket,
  actorId = null
) {
  return emit(
    EVENTS.TICKET_CLOSED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      actorId,

      closedAt:
        ticket.closedAt,
    }
  );
}

function emitTicketClaimed(
  guildId,
  ticket,
  actorId = null
) {
  return emit(
    EVENTS.TICKET_CLAIMED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      actorId,

      claimedAt:
        ticket.claimedAt,
    }
  );
}

function emitTicketReopened(
  guildId,
  ticket,
  actorId = null
) {
  return emit(
    EVENTS.TICKET_REOPENED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      actorId,

      reopenedAt:
        ticket.reopenedAt,
    }
  );
}

function emitTicketArchived(
  guildId,
  ticket,
  actorId = null
) {
  return emit(
    EVENTS.TICKET_ARCHIVED,
    guildId,
    {
      ticketId:
        ticket.ticketId,

      displayId:
        ticket.displayId,

      actorId,

      archivedAt:
        ticket.archivedAt,
    }
  );
}

function emitTicketDeleted(
  guildId,
  ticketId,
  displayId = null
) {
  return emit(
    EVENTS.TICKET_DELETED,
    guildId,
    {
      ticketId,
      displayId,
    }
  );
}

/*
|--------------------------------------------------------------------------
| Panel Events
|--------------------------------------------------------------------------
*/

function emitPanelCreated(
  guildId,
  panel
) {
  return emit(
    EVENTS.PANEL_CREATED,
    guildId,
    {
      panelId:
        panel.panelId,

      name:
        panel.name,

      type:
        panel.ticketType,
    }
  );
}

function emitPanelUpdated(
  guildId,
  panel
) {
  return emit(
    EVENTS.PANEL_UPDATED,
    guildId,
    {
      panelId:
        panel.panelId,

      name:
        panel.name,

      updatedAt:
        panel.updatedAt,
    }
  );
}

function emitPanelDeleted(
  guildId,
  panelId
) {
  return emit(
    EVENTS.PANEL_DELETED,
    guildId,
    {
      panelId,
    }
  );
}

function emitPanelDeployed(
  guildId,
  panel
) {
  return emit(
    EVENTS.PANEL_DEPLOYED,
    guildId,
    {
      panelId:
        panel.panelId,

      deployChannelId:
        panel.deployChannelId,

      deployMessageId:
        panel.deployMessageId,

      deployed:
        panel.deployed === true,
    }
  );
}

/*
|--------------------------------------------------------------------------
| Timeline Events
|--------------------------------------------------------------------------
*/

function emitTimelineEntry(
  guildId,
  ticketId,
  entry
) {
  return emit(
    EVENTS.TIMELINE_ENTRY,
    guildId,
    {
      ticketId,

      entry,
    }
  );
}

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

function emitAnalyticsUpdated(
  guildId,
  analytics
) {
  return emit(
    EVENTS.ANALYTICS_UPDATED,
    guildId,
    analytics
  );
}

module.exports = {
  EVENTS,
  STANDARD_EVENTS,

  setSocketProvider,
  getSocketServer,

  emit,
  emitForTicket,

  emitTicketCreated,
  emitTicketUpdated,
  emitTicketClosed,
  emitTicketClaimed,
  emitTicketReopened,
  emitTicketArchived,
  emitTicketDeleted,

  emitPanelCreated,
  emitPanelUpdated,
  emitPanelDeleted,
  emitPanelDeployed,

  emitTimelineEntry,

  emitAnalyticsUpdated,
};