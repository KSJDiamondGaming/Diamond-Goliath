let io = null;
const botListeners = new Set();

const {
  setSocketProvider,
} = require('../../modules/tickets/ticketSocketEvents');

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

  setSocketProvider(() => io);

  io.on('connection', (socket) => {
    console.log(`🟢 Dashboard connected: ${socket.id}`);
    socket.join('goliath:tickets');

    function joinGuildRoom(guildId) {
      const id = String(guildId || '').trim();
      if (!id) return;

      socket.on('joinGuild', joinGuildRoom);
      socket.on('automod:join', joinGuildRoom);
      socket.on('tickets:joinGuild', joinGuildRoom);

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

/**
 * GOLIATH STANDARD SYNC LAYER
 * Centralised event emitter for Discord ↔ Dashboard sync
 */
function emitSyncEvent(event, guildId, payload = {}) {
  // basic mapping layer (expand later)
  switch (event) {
    case 'ticket.updated':
    case 'ticket.created':
    case 'ticket.closed':
      return emitGuildUpdate(guildId, {
        type: event,
        ...payload,
      });

    case 'form.submitted':
    case 'form.updated':
      return emitGuildUpdate(guildId, {
        type: event,
        ...payload,
      });

    case 'embed.created':
    case 'embed.updated':
      return emitGuildUpdate(guildId, {
        type: event,
        ...payload,
      });

    case 'case.created':
    case 'case.updated':
      return emitGuildUpdate(guildId, {
        type: event,
        ...payload,
      });

    default:
      return emitGuildUpdate(guildId, {
        type: event,
        ...payload,
      });
  }
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