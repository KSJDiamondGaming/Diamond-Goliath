'use strict';

// src/core/logging/cases/caseSocketEvents.js

const EVENTS = Object.freeze({
  CASE_CREATED: 'case_created',
  CASE_UPDATED: 'case_updated',
  CASE_STATUS_UPDATED: 'case_status_updated',
  CASE_NOTE_UPDATED: 'case_note_updated',
});

const STANDARD_EVENTS = Object.freeze({
  case_created: 'case.created',
  case_updated: 'case.updated',
  case_status_updated: 'case.status.updated',
  case_note_updated: 'case.note.updated',
});

let socketProvider = null;

function now() {
  return new Date().toISOString();
}

function setSocketProvider(provider) {
  socketProvider = provider;
}

function getSocketServer() {
  if (!socketProvider) return null;

  try {
    return typeof socketProvider === 'function'
      ? socketProvider()
      : socketProvider;
  } catch {
    return null;
  }
}

function getRoomName(guildId) {
  return `guild:${guildId}`;
}

function getStandardEvent(event) {
  return STANDARD_EVENTS[event] || event;
}

function createPayload(type, guildId, data = {}) {
  const event = getStandardEvent(type);

  return {
    type,
    event,
    guildId: String(guildId),
    timestamp: now(),
    updatedAt: now(),
    data,
  };
}

function emitToTargets(io, guildId, legacyEvent, standardEvent, payload) {
  const guildRoom = getRoomName(guildId);
  const emitNames = [legacyEvent, standardEvent].filter(
    (eventName, index, list) => eventName && list.indexOf(eventName) === index
  );

  for (const eventName of emitNames) {
    io.to(guildRoom).emit(eventName, payload);
  }

  io.to(guildRoom).emit('guild:update', payload);
  io.to(guildRoom).emit('goliath_realtime_event', payload);
}

function emit(event, guildId, data = {}) {
  const payload = createPayload(event, guildId, data);
  const io = getSocketServer();

  if (!io) return payload;

  try {
    emitToTargets(io, guildId, event, payload.event, payload);
  } catch (error) {
    console.error('[CaseSockets] Failed to emit event:', event, error);
  }

  return payload;
}

function casePayload(caseRecord = {}) {
  return {
    caseId: caseRecord.caseId || null,
    userId: caseRecord.userId || null,
    moderatorId: caseRecord.moderatorId || null,
    action: caseRecord.action || null,
    reason: caseRecord.reason || null,
    metadata: caseRecord.metadata || {},
    status: caseRecord.status || null,
    relatedCaseId: caseRecord.relatedCaseId || null,
    note: caseRecord.note || null,
    createdAt: caseRecord.createdAt || null,
    updatedAt: caseRecord.updatedAt || null,
  };
}

function emitCaseCreated(guildId, caseRecord) {
  return emit(EVENTS.CASE_CREATED, guildId, casePayload(caseRecord));
}

function emitCaseUpdated(guildId, caseRecord) {
  return emit(EVENTS.CASE_UPDATED, guildId, casePayload(caseRecord));
}

function emitCaseStatusUpdated(guildId, caseRecord) {
  return emit(EVENTS.CASE_STATUS_UPDATED, guildId, casePayload(caseRecord));
}

function emitCaseNoteUpdated(guildId, caseRecord) {
  return emit(EVENTS.CASE_NOTE_UPDATED, guildId, casePayload(caseRecord));
}

module.exports = {
  EVENTS,
  STANDARD_EVENTS,

  setSocketProvider,
  getSocketServer,

  emit,
  emitCaseCreated,
  emitCaseUpdated,
  emitCaseStatusUpdated,
  emitCaseNoteUpdated,
};