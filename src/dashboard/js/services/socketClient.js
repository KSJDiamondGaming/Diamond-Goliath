import { io } from 'socket.io-client';

let socket = null;

function resolveSocketUrl() {
  if (
    typeof window !== 'undefined' &&
    window.location
  ) {
    return window.location.origin;
  }

  return undefined;
}

function normaliseScopeVariants(scope) {
  const value = String(scope || '').trim().toLowerCase();

  if (!value) return [];

  const variants = new Set([value]);

  if (value.endsWith('s') && value.length > 1) {
    variants.add(value.slice(0, -1));
  } else {
    variants.add(`${value}s`);
  }

  return [...variants];
}

function eventMatchesModule(event, moduleName) {
  const scopes = normaliseScopeVariants(moduleName);

  if (!scopes.length) return true;

  const names = [
    event?.event,
    event?.type,
    event?.module,
    event?.scope,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return names.some((name) =>
    scopes.some((scope) =>
      name === scope ||
      name.startsWith(`${scope}.`) ||
      name.startsWith(`${scope}_`) ||
      name.includes(scope)
    )
  );
}

export function getSocket() {
  if (!socket) {
    socket = io(resolveSocketUrl(), {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log(
        '[Realtime] Connected:',
        socket.id
      );
    });

    socket.on('disconnect', (reason) => {
      console.log(
        '[Realtime] Disconnected:',
        reason
      );
    });

    socket.on('connect_error', (error) => {
      console.error(
        '[Realtime] Connection Error:',
        error
      );
    });
  }

  return socket;
}

/*
|--------------------------------------------------------------------------
| Room Joiners
|--------------------------------------------------------------------------
*/

export function joinGuildRoom(guildId) {
  const id = String(guildId || '').trim();

  if (!id || id === 'null') {
    return null;
  }

  const activeSocket = getSocket();

  activeSocket.emit(
    'joinGuild',
    id
  );

  activeSocket.emit(
    'tickets:joinGuild',
    id
  );

  activeSocket.emit(
    'forms:joinGuild',
    id
  );

  activeSocket.emit(
    'embeds:joinGuild',
    id
  );

  activeSocket.emit(
    'cases:joinGuild',
    id
  );

  return activeSocket;
}

/*
|--------------------------------------------------------------------------
| Generic Event Listener
|--------------------------------------------------------------------------
*/

export function onSocketEvent(
  eventName,
  callback
) {
  if (
    !eventName ||
    typeof callback !== 'function'
  ) {
    return () => {};
  }

  const activeSocket =
    getSocket();

  activeSocket.on(
    eventName,
    callback
  );

  return () => {
    activeSocket.off(
      eventName,
      callback
    );
  };
}

export function onSocketEvents(
  eventNames,
  callback
) {
  const names = Array.isArray(eventNames)
    ? eventNames.filter(Boolean)
    : [eventNames].filter(Boolean);

  if (!names.length || typeof callback !== 'function') {
    return () => {};
  }

  const unsubscribers = names.map((eventName) =>
    onSocketEvent(eventName, callback)
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  };
}

/*
|--------------------------------------------------------------------------
| Guild Updates
|--------------------------------------------------------------------------
*/

export function listenForGuildUpdate(...args) {
  const callback = args.find((arg) => typeof arg === 'function');
  const moduleName = args.length >= 3 ? args[1] : null;

  if (typeof callback !== 'function') {
    return () => {};
  }

  return onSocketEvent(
    'guild:update',
    (event) => {
      if (!eventMatchesModule(event, moduleName)) return;
      callback(event);
    }
  );
}

/*
|--------------------------------------------------------------------------
| Ticket Events
|--------------------------------------------------------------------------
*/

export function listenForTicketCreated(
  callback
) {
  return onSocketEvents(
    ['ticket.created', 'ticket_created'],
    callback
  );
}

export function listenForTicketUpdated(
  callback
) {
  return onSocketEvents(
    ['ticket.updated', 'ticket_updated'],
    callback
  );
}

export function listenForTicketClosed(
  callback
) {
  return onSocketEvents(
    ['ticket.closed', 'ticket_closed'],
    callback
  );
}

export function listenForTicketClaimed(
  callback
) {
  return onSocketEvents(
    ['ticket.claimed', 'ticket_claimed'],
    callback
  );
}

export function listenForTicketReopened(
  callback
) {
  return onSocketEvents(
    ['ticket.reopened', 'ticket_reopened'],
    callback
  );
}

export function listenForTicketArchived(
  callback
) {
  return onSocketEvents(
    ['ticket.archived', 'ticket_archived'],
    callback
  );
}

export function listenForTicketDeleted(
  callback
) {
  return onSocketEvents(
    ['ticket.deleted', 'ticket_deleted'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Timeline Events
|--------------------------------------------------------------------------
*/

export function listenForTimelineEntry(
  callback
) {
  return onSocketEvents(
    ['ticket.timeline.entry', 'ticket_timeline_entry'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Ticket Panel Events
|--------------------------------------------------------------------------
*/

export function listenForPanelCreated(
  callback
) {
  return onSocketEvents(
    ['panel.created', 'panel_created'],
    callback
  );
}

export function listenForPanelUpdated(
  callback
) {
  return onSocketEvents(
    ['panel.updated', 'panel_updated'],
    callback
  );
}

export function listenForPanelDeleted(
  callback
) {
  return onSocketEvents(
    ['panel.deleted', 'panel_deleted'],
    callback
  );
}

export function listenForPanelDeployed(
  callback
) {
  return onSocketEvents(
    ['panel.deployed', 'panel_deployed'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Ticket Analytics
|--------------------------------------------------------------------------
*/

export function listenForAnalyticsUpdated(
  callback
) {
  return onSocketEvents(
    ['ticket.analytics.updated', 'ticket_analytics_updated'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Form Events
|--------------------------------------------------------------------------
*/

export function listenForFormUpdated(
  callback
) {
  return onSocketEvents(
    ['form.updated', 'form_updated'],
    callback
  );
}

export function listenForFormSubmitted(
  callback
) {
  return onSocketEvents(
    ['form.submitted', 'form_submitted'],
    callback
  );
}

export function listenForFormSubmissionUpdated(
  callback
) {
  return onSocketEvents(
    ['form.submission.updated', 'form_submission_updated'],
    callback
  );
}

export function listenForFormPanelUpdated(
  callback
) {
  return onSocketEvents(
    ['form.panel.updated', 'form_panel_updated'],
    callback
  );
}

export function listenForFormAnalyticsUpdated(
  callback
) {
  return onSocketEvents(
    ['form.analytics.updated', 'form_analytics_updated'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Embed Events
|--------------------------------------------------------------------------
*/

export function listenForEmbedUpdated(
  callback
) {
  return onSocketEvents(
    ['embed.updated', 'embed_updated'],
    callback
  );
}

export function listenForEmbedStatusUpdated(
  callback
) {
  return onSocketEvents(
    ['embed.status.updated', 'embed_status_updated'],
    callback
  );
}

export function listenForEmbedDeleted(
  callback
) {
  return onSocketEvents(
    ['embed.deleted', 'embed_deleted'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Case Events
|--------------------------------------------------------------------------
*/

export function listenForCaseCreated(
  callback
) {
  return onSocketEvents(
    ['case.created', 'case_created'],
    callback
  );
}

export function listenForCaseUpdated(
  callback
) {
  return onSocketEvents(
    ['case.updated', 'case_updated'],
    callback
  );
}

export function listenForCaseStatusUpdated(
  callback
) {
  return onSocketEvents(
    ['case.status.updated', 'case_status_updated'],
    callback
  );
}

export function listenForCaseNoteUpdated(
  callback
) {
  return onSocketEvents(
    ['case.note.updated', 'case_note_updated'],
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Global Feed
|--------------------------------------------------------------------------
*/

export function listenForRealtimeFeed(
  callback
) {
  return onSocketEvent(
    'goliath_realtime_event',
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Disconnect
|--------------------------------------------------------------------------
*/

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export { socket };

export default {
  socket,

  getSocket,
  disconnectSocket,

  joinGuildRoom,

  onSocketEvent,
  onSocketEvents,

  listenForGuildUpdate,

  listenForTicketCreated,
  listenForTicketUpdated,
  listenForTicketClosed,
  listenForTicketClaimed,
  listenForTicketReopened,
  listenForTicketArchived,
  listenForTicketDeleted,

  listenForTimelineEntry,

  listenForPanelCreated,
  listenForPanelUpdated,
  listenForPanelDeleted,
  listenForPanelDeployed,

  listenForAnalyticsUpdated,

  listenForFormUpdated,
  listenForFormSubmitted,
  listenForFormSubmissionUpdated,
  listenForFormPanelUpdated,
  listenForFormAnalyticsUpdated,

  listenForEmbedUpdated,
  listenForEmbedStatusUpdated,
  listenForEmbedDeleted,

  listenForCaseCreated,
  listenForCaseUpdated,
  listenForCaseStatusUpdated,
  listenForCaseNoteUpdated,

  listenForRealtimeFeed,
};