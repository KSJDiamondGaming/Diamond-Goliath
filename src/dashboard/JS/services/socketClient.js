import { io } from 'socket.io-client';

const IS_LOCAL_DEV =
  import.meta.env.DEV ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const SOCKET_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (IS_LOCAL_DEV ? 'http://localhost:3001' : window.location.origin);

export const socket = io(SOCKET_BASE, {
  withCredentials: true,
  autoConnect: true,
});

export function joinGuildRoom(guildId) {
  if (!guildId) return;

  socket.emit('joinGuild', guildId);
  socket.emit('automod:join', guildId);
}

export function leaveGuildRoom(guildId) {
  if (!guildId) return;

  socket.emit('leaveGuild', guildId);
}

export function listenForGuildUpdate(handler) {
  if (typeof handler !== 'function') return () => {};

  socket.on('guild:update', handler);

  return () => {
    socket.off('guild:update', handler);
  };
}

export function onSocketEvent(eventName, handler) {
  if (!eventName || typeof handler !== 'function') {
    return () => {};
  }

  socket.on(eventName, handler);

  return () => {
    socket.off(eventName, handler);
  };
}

export function emitSocketEvent(eventName, payload) {
  if (!eventName) return;

  socket.emit(eventName, payload);
}