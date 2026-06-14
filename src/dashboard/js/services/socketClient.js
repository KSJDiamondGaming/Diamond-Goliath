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

/*
|--------------------------------------------------------------------------
| Guild Updates
|--------------------------------------------------------------------------
*/

export function listenForGuildUpdate(
  callback
) {
  return onSocketEvent(
    'guild:update',
    callback
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
  return onSocketEvent(
    'ticket_created',
    callback
  );
}

export function listenForTicketUpdated(
  callback
) {
  return onSocketEvent(
    'ticket_updated',
    callback
  );
}

export function listenForTicketClosed(
  callback
) {
  return onSocketEvent(
    'ticket_closed',
    callback
  );
}

export function listenForTicketClaimed(
  callback
) {
  return onSocketEvent(
    'ticket_claimed',
    callback
  );
}

export function listenForTicketReopened(
  callback
) {
  return onSocketEvent(
    'ticket_reopened',
    callback
  );
}

export function listenForTicketArchived(
  callback
) {
  return onSocketEvent(
    'ticket_archived',
    callback
  );
}

export function listenForTicketDeleted(
  callback
) {
  return onSocketEvent(
    'ticket_deleted',
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
  return onSocketEvent(
    'ticket_timeline_entry',
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Panel Events
|--------------------------------------------------------------------------
*/

export function listenForPanelCreated(
  callback
) {
  return onSocketEvent(
    'panel_created',
    callback
  );
}

export function listenForPanelUpdated(
  callback
) {
  return onSocketEvent(
    'panel_updated',
    callback
  );
}

export function listenForPanelDeleted(
  callback
) {
  return onSocketEvent(
    'panel_deleted',
    callback
  );
}

export function listenForPanelDeployed(
  callback
) {
  return onSocketEvent(
    'panel_deployed',
    callback
  );
}

/*
|--------------------------------------------------------------------------
| Analytics
|--------------------------------------------------------------------------
*/

export function listenForAnalyticsUpdated(
  callback
) {
  return onSocketEvent(
    'ticket_analytics_updated',
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

  listenForRealtimeFeed,
};