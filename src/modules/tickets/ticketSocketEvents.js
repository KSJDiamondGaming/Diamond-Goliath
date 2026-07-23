'use strict';

// src/modules/tickets/ticketSocketEvents.js

const notifications = require('../../core/notifications/notificationStore');
const {
  emitGuildUpdate,
  emitDirectSyncEvent,
  emitRoomEvent,
} = require('../../server/sockets/socketHub');

const TICKET_ROOM = 'goliath:tickets';

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

function now() {
  return new Date().toISOString();
}

function notify(guildId, payload = {}) {
  try {
    return notifications.addNotification(guildId, {
      source: 'tickets',
      route: '/tickets',
      ...payload,
    });
  } catch (error) {
    console.warn('[TicketSockets] Notification skipped:', error.message || error);
    return null;
  }
}

function getStandardEvent(event) {
  return STANDARD_EVENTS[event] || event;
}

function createPayload(type, guildId, data = {}) {
  const timestamp = now();

  return {
    type,
    event: getStandardEvent(type),
    guildId: String(guildId),
    timestamp,
    updatedAt: timestamp,
    data,
  };
}

function emitPayload(guildId, payload) {
  const update = emitGuildUpdate(guildId, payload);
  if (!update) return payload;

  const eventNames = [
    payload.type,
    payload.event,
    'goliath_realtime_event',
  ].filter((eventName, index, list) =>
    eventName && list.indexOf(eventName) === index
  );

  for (const eventName of eventNames) {
    emitDirectSyncEvent(guildId, eventName, update);
    emitRoomEvent(TICKET_ROOM, eventName, update);
  }

  return update;
}

function emit(event, guildId, data = {}) {
  return emitPayload(guildId, createPayload(event, guildId, data));
}

function emitForTicket(_io, ticket, event, data = {}) {
  if (!ticket?.guildId) return false;

  return emit(event, ticket.guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    status: ticket.status,
    type: ticket.type,
    priority: ticket.priority,
    ...data,
  });
}

function emitTicketCreated(guildId, ticket) {
  notify(guildId, {
    level: 'info',
    title: 'Ticket created',
    message: `${ticket.displayId || ticket.ticketId} was opened.`,
    metadata: {
      ticketId: ticket.ticketId,
      displayId: ticket.displayId,
      status: ticket.status,
      type: ticket.type,
    },
  });

  return emit(EVENTS.TICKET_CREATED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    status: ticket.status,
    type: ticket.type,
    priority: ticket.priority,
    creatorId: ticket.creatorId,
    panelId: ticket.metadata?.panelId || null,
    createdAt: ticket.createdAt,
  });
}

function emitTicketUpdated(guildId, ticket) {
  return emit(EVENTS.TICKET_UPDATED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    status: ticket.status,
    updatedAt: ticket.updatedAt,
  });
}

function emitTicketClosed(guildId, ticket, actorId = null) {
  notify(guildId, {
    level: 'success',
    title: 'Ticket closed',
    message: `${ticket.displayId || ticket.ticketId} was closed.`,
    metadata: { ticketId: ticket.ticketId, displayId: ticket.displayId, actorId },
  });

  return emit(EVENTS.TICKET_CLOSED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    actorId,
    closedAt: ticket.closedAt,
  });
}

function emitTicketClaimed(guildId, ticket, actorId = null) {
  notify(guildId, {
    level: 'info',
    title: 'Ticket claimed',
    message: `${ticket.displayId || ticket.ticketId} was claimed.`,
    metadata: { ticketId: ticket.ticketId, displayId: ticket.displayId, actorId },
  });

  return emit(EVENTS.TICKET_CLAIMED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    actorId,
    claimedAt: ticket.claimedAt,
  });
}

function emitTicketReopened(guildId, ticket, actorId = null) {
  notify(guildId, {
    level: 'warning',
    title: 'Ticket reopened',
    message: `${ticket.displayId || ticket.ticketId} was reopened.`,
    metadata: { ticketId: ticket.ticketId, displayId: ticket.displayId, actorId },
  });

  return emit(EVENTS.TICKET_REOPENED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    actorId,
    reopenedAt: ticket.reopenedAt,
  });
}

function emitTicketArchived(guildId, ticket, actorId = null) {
  notify(guildId, {
    level: 'success',
    title: 'Ticket archived',
    message: `${ticket.displayId || ticket.ticketId} was archived.`,
    metadata: { ticketId: ticket.ticketId, displayId: ticket.displayId, actorId },
  });

  return emit(EVENTS.TICKET_ARCHIVED, guildId, {
    ticketId: ticket.ticketId,
    displayId: ticket.displayId,
    actorId,
    archivedAt: ticket.archivedAt,
  });
}

function emitTicketDeleted(guildId, ticketId, displayId = null) {
  notify(guildId, {
    level: 'warning',
    title: 'Ticket deleted',
    message: `${displayId || ticketId} was deleted.`,
    metadata: { ticketId, displayId },
  });

  return emit(EVENTS.TICKET_DELETED, guildId, { ticketId, displayId });
}

function emitPanelCreated(guildId, panel) {
  return emit(EVENTS.PANEL_CREATED, guildId, {
    panelId: panel.panelId,
    name: panel.name,
    type: panel.ticketType,
  });
}

function emitPanelUpdated(guildId, panel) {
  return emit(EVENTS.PANEL_UPDATED, guildId, {
    panelId: panel.panelId,
    name: panel.name,
    updatedAt: panel.updatedAt,
  });
}

function emitPanelDeleted(guildId, panelId) {
  return emit(EVENTS.PANEL_DELETED, guildId, { panelId });
}

function emitPanelDeployed(guildId, panel) {
  return emit(EVENTS.PANEL_DEPLOYED, guildId, {
    panelId: panel.panelId,
    deployChannelId: panel.deployChannelId,
    deployMessageId: panel.deployMessageId,
    deployed: panel.deployed === true,
  });
}

function emitTimelineEntry(guildId, ticketId, entry) {
  return emit(EVENTS.TIMELINE_ENTRY, guildId, { ticketId, entry });
}

function emitAnalyticsUpdated(guildId, analytics) {
  return emit(EVENTS.ANALYTICS_UPDATED, guildId, analytics);
}

module.exports = {
  EVENTS,
  STANDARD_EVENTS,
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
