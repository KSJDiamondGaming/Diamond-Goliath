import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io();
  }

  return socket;
}

export function joinGuildRoom(guildId) {
  const id = String(guildId || '').trim();

  if (!id || id === 'null') {
    return null;
  }

  const activeSocket = getSocket();

  activeSocket.emit('joinGuild', id);

  return activeSocket;
}

export function listenForGuildUpdate(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const activeSocket = getSocket();

  activeSocket.on('guild:update', callback);

  return () => {
    activeSocket.off('guild:update', callback);
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default {
  getSocket,
  joinGuildRoom,
  listenForGuildUpdate,
  disconnectSocket,
};