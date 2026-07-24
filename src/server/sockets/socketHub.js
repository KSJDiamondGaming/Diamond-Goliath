let io = null;

function normaliseGuildId(guildId) {
  const id = String(guildId || '').trim();
  return /^\d{16,20}$/.test(id) ? id : '';
}

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

  io.on('connection', (socket) => {
    console.log(`🟢 Dashboard connected: ${socket.id}`);
    socket.join('goliath:tickets');

    function joinGuildRoom(guildId) {
      const id = normaliseGuildId(guildId);
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

function emitGuildUpdate(guildId, payload = {}) {
  const id = normaliseGuildId(guildId);

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

  return update;
}

function emitRoomEvent(room, event, update) {
  const roomName = String(room || '').trim();
  const eventName = String(event || '').trim();
  if (!roomName || !eventName || !io) return false;

  io.to(roomName).emit(eventName, update);
  return true;
}

module.exports = {
  initSocketHub,
  emitGuildUpdate,
  emitRoomEvent,
};
