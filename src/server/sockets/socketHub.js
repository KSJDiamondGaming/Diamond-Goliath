let io = null;
const botListeners = new Set();

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
      origin: options?.clientUrl || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🟢 Dashboard connected: ${socket.id}`);

    function joinGuildRoom(guildId) {
      const id = String(guildId || '').trim();
      if (!id) return;

      const room = getRoomName(id);
      socket.join(room);

      console.log(`${socket.id} joined ${room}`);
    }

    socket.on('joinGuild', joinGuildRoom);
    socket.on('automod:join', joinGuildRoom);

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

  if (!id) return;

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
}

module.exports = {
  initSocketHub,
  emitGuildUpdate,
  onGuildUpdate,
};