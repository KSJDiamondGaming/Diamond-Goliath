let io = null;
const botListeners = new Set();

const {
  setSocketProvider: setEmbedSocketProvider,
} = require('../../modules/embed/embedSocketEvents');

const {
  setSocketProvider: setCaseSocketProvider,
} = require('../../core/logging/cases/caseSocketEvents');

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
        'http://localhost:5175',

      credentials: true,
    },
  });

  setEmbedSocketProvider(() => io);
  setCaseSocketProvider(() => io);

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

  const data =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};

  const update = {
    ...data,
    guildId: id,
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

function emitRoomEvent(room, event, update) {
  const roomName = String(room || '').trim();
  const eventName = normaliseSyncEvent(event);
  if (!roomName || !eventName || !io) return false;

  io.to(roomName).emit(eventName, update);
  return true;
}

function emitDirectSyncEvent(guildId, event, update) {
  const id = String(guildId || '').trim();
  if (!id) return false;

  return emitRoomEvent(getRoomName(id), event, update);
}

module.exports = {
  initSocketHub,
  getRoomName,
  onGuildUpdate,
  emitGuildUpdate,
  emitDirectSyncEvent,
  emitRoomEvent,
};
