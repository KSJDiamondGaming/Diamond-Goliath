let io = null;

function initSocketHub(server, options = {}) {
  const { Server } = require('socket.io');

  io = new Server(server, {
    cors: {
      origin: options.clientUrl || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Dashboard connected: ${socket.id}`);

    socket.on('joinGuild', (guildId) => {
      if (!guildId) return;
      socket.join(`guild:${guildId}`);
      console.log(`📡 ${socket.id} joined guild:${guildId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Dashboard disconnected: ${socket.id}`);
    });
  });

  return io;
}

function emitGuildUpdate(guildId, payload = {}) {
  if (!io || !guildId) return;

  io.to(`guild:${guildId}`).emit('guild:update', {
    guildId,
    ...payload,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  initSocketHub,
  emitGuildUpdate,
};