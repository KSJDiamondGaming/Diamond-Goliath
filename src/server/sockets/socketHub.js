let io = null;
const botListeners = new Set();

const {
  setSocketProvider: setTicketSocketProvider,
} = require('../../modules/tickets/ticketSocketEvents');

const {
  setSocketProvider: setFormSocketProvider,
} = require('../../modules/forms/formSocketEvents');

function getRoomName(guildId) {
  return `guild:${guildId}`;
}

function initSocketHub(server, options = {}) {
  const { Server } = require('socket.io');

  if (io) {
    return io; // prevent double init
  }

  io = new Server(server, {
    cors: {
      origin:
        options?.clientUrl ||
        'http://localhost:5173',

      credentials: true,
    },
  });

  setTicketSocketProvider(() => io);
  setFormSocketProvider(() => io);

  io.on('connection', (socket) => {
    console.log(`🟢 Dashboard connected: ${socket.id}`);
    socket.join('goliath:tickets');

    function joinGuildRoom(guildId) {
      const id = String(guildId || '').trim();
      if (!id) return;

      const room = getRoomName(id);
      socket.join(room);

      console.log(`${socket.id} joined ${room}`);
    }

    socket.on('joinGuild', joinGuildRoom);
    socket.on('automod:join', joinGuildRoom);
    socket.on('tickets:joinGuild', joinGuildRoom);
    socket.on('forms:joinGuild', joinGuildRoom);

    socket.on('disconnect', () => {
      console.log(`🔴 Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

function onGuildUpdate(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  botListeners.add(listener);

  return () => {
    botListeners.delete(listener);
  };
}

function emitGuildUpdate(guildId, payload = {}) {
  const id = String(guildId || '').trim();

  if (!id) return null;

  const update = {
    guildId: id,
    ...(payload && typeof payload === 'object' ? payload : {}),
    updatedAt: new Date().toISOString(),
  };

  if (io) {
    io.to(getRoomName(id)).emit('guild:update', update);
  }

  for (const listener of botListeners) {
    try {
      listener(update);
    } catch (error) {
      console.error('Guild update listener failed:', error);
    }
  }

  return update;
}

function normaliseSyncEvent(event) {
  return String(event || '').trim();
}

function emitDirectSyncEvent(guildId, event, update) {
  const id = String(guildId || '').trim();
  const eventName = normaliseSyncEvent(event);

  if (!io || !id || !eventName || !update) {
    return;
  }

  io.to(getRoomName(id)).emit(eventName, update);
  io.to(getRoomName(id)).emit('goliath_realtime_event', update);
}

/**
 * GOLIATH STANDARD SYNC LAYER
 * Centralised event emitter for Discord ↔ Dashboard sync.
 *
 * Always emits:
 * - guild:update              legacy/dashboard-wide refresh channel
 * - direct event name         ticket.created, form.submitted, etc.
 * - goliath_realtime_event    global live activity feed
 */
function emitSyncEvent(event, guildId, payload = {}) {
  const eventName = normaliseSyncEvent(event);

  if (!eventName) {
    return null;
  }

  const update = emitGuildUpdate(guildId, {
    type: eventName,
    event: eventName,
    ...(payload && typeof payload === 'object' ? payload : {}),
  });

  emitDirectSyncEvent(guildId, eventName, update);

  return update;
}

function emitSecurityEvent(
  guildId,
  payload = {}
) {
  emitGuildUpdate(guildId, {
    type: 'security:event',
    ...payload,
  });
}

function emitSecurityOverview(
  guildId,
  payload = {}
) {
  emitGuildUpdate(guildId, {
    type: 'security:overview',
    ...payload,
  });
}

function emitLockdownUpdate(
  guildId,
  payload = {}
) {
  emitGuildUpdate(guildId, {
    type: 'security:lockdown',
    ...payload,
  });
}

function emitQuarantineUpdate(
  guildId,
  payload = {}
) {
  emitGuildUpdate(guildId, {
    type: 'security:quarantine',
    ...payload,
  });
}

function emitRestoreUpdate(
  guildId,
  payload = {}
) {
  emitGuildUpdate(guildId, {
    type: 'security:restore',
    ...payload,
  });
}

module.exports = {
  initSocketHub,
  emitGuildUpdate,
  emitSyncEvent,
  onGuildUpdate,
  emitSecurityEvent,
  emitSecurityOverview,
  emitLockdownUpdate,
  emitQuarantineUpdate,
  emitRestoreUpdate,
};