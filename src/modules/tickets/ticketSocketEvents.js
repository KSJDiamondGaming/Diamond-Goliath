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

function createPayload(type, guildId, data = {}) {
  return {
    type,

    guildId: String(guildId),

    timestamp: now(),

    data,
  };
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
    /*
     * Guild room
     */

    io.to(`guild:${guildId}`).emit(
      event,
      payload
    );

    /*
     * Global admin room
     */

    io.to('goliath:tickets').emit(
      event,
      payload
    );

    /*
     * General realtime feed
     */

    io.emit(
      'goliath_realtime_event',
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

  setSocketProvider,
  getSocketServer,

  emit,

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
