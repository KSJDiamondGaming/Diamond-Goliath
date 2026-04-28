let io = null;
const botListeners = new Set();

function initSocketHub(server, options = {}) {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: options.clientUrl || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Dashboard connected: ${socket.id}`);

    socket.on('joinGuild', (guildId) => {
      if (!guildId) return;
      socket.join(`guild:${guildId}`);
      console.log(`${socket.id} joined guild:${guildId}`);
    });

    socket.on('automod:join', (guildId) => {
      if (!guildId) return;
      socket.join(`guild:${guildId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

function onGuildUpdate(listener) {
  if (typeof listener !== 'function') return () => {};
  botListeners.add(listener);
  return () => botListeners.delete(listener);
}

function emitGuildUpdate(guildId, payload = {}) {
  if (!guildId) return;

  const update = {
    guildId,
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  if (io) {
    io.to(`guild:${guildId}`).emit('guild:update', update);
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