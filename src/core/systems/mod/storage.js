'use strict';

const {
  emitGuildUpdate,
} = require('../../../server/sockets/socketHub');

const EVENTS = Object.freeze({
  CASE_CREATED: 'case.created',
  CASE_UPDATED: 'case.updated',
  CASE_STATUS_UPDATED: 'case.status.updated',
  CASE_NOTE_UPDATED: 'case.note.updated',
});

function now() {
  return new Date().toISOString();
}

function createPayload(event, guildId, data = {}) {
  const timestamp = now();
  return {
    module: 'cases',
    event,
    guildId: String(guildId),
    timestamp,
    updatedAt: timestamp,
    data,
  };
}

function emit(event, guildId, data = {}) {
  const payload = createPayload(event, guildId, data);
  const update = emitGuildUpdate(guildId, payload);
  return update || payload;
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

function emitCaseCreated(guildId, caseRecord) { return emit(EVENTS.CASE_CREATED, guildId, casePayload(caseRecord)); }
function emitCaseUpdated(guildId, caseRecord) { return emit(EVENTS.CASE_UPDATED, guildId, casePayload(caseRecord)); }
function emitCaseStatusUpdated(guildId, caseRecord) { return emit(EVENTS.CASE_STATUS_UPDATED, guildId, casePayload(caseRecord)); }
function emitCaseNoteUpdated(guildId, caseRecord) { return emit(EVENTS.CASE_NOTE_UPDATED, guildId, casePayload(caseRecord)); }

const db = require('../../logging/stores/moderationStore');

function parseMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function mapCase(row) {
  if (!row) return null;
  return {
    caseId: row.case_id,
    guildId: row.guild_id,
    userId: row.user_id,
    moderatorId: row.moderator_id,
    action: row.action,
    reason: row.reason,
    metadata: parseMetadata(row.metadata),
    status: row.status,
    relatedCaseId: row.related_case_id,
    note: row.note || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createCase({ guildId, userId, moderatorId, action, reason, metadata = {}, status = 'active', relatedCaseId = null }) {
  const createdAt = new Date().toISOString();
  const result = db.prepare(`INSERT INTO cases (guild_id, user_id, moderator_id, action, reason, metadata, status, related_case_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`).run(guildId, userId, moderatorId, action, reason, JSON.stringify(metadata || {}), status, relatedCaseId, createdAt);
  const created = getCaseById(guildId, result.lastInsertRowid);
  if (created) emitCaseCreated(guildId, created);
  return created;
}

function getCaseById(guildId, caseId) { return mapCase(db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?').get(guildId, Number(caseId))); }
function getCasesForUser(guildId, userId) { return db.prepare('SELECT * FROM cases WHERE guild_id = ? AND user_id = ? ORDER BY case_id DESC').all(guildId, userId).map(mapCase); }
function getCasesByModerator(guildId, moderatorId, filters = {}) {
  let query = 'SELECT * FROM cases WHERE guild_id = ? AND moderator_id = ?'; const params = [guildId, moderatorId];
  if (filters.action) { query += ' AND action = ?'; params.push(filters.action); }
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  return db.prepare(`${query} ORDER BY case_id DESC`).all(...params).map(mapCase);
}
function getFilteredCases(guildId, userId, filters = {}) {
  let query = 'SELECT * FROM cases WHERE guild_id = ? AND user_id = ?'; const params = [guildId, userId];
  if (filters.action) { query += ' AND action = ?'; params.push(filters.action); }
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  return db.prepare(`${query} ORDER BY case_id DESC`).all(...params).map(mapCase);
}
function getAllCases(guildId) { return db.prepare('SELECT * FROM cases WHERE guild_id = ? ORDER BY case_id DESC').all(guildId).map(mapCase); }
function searchCaseIds(guildId, partial = '') { return db.prepare('SELECT case_id, action, status, user_id FROM cases WHERE guild_id = ? AND CAST(case_id AS TEXT) LIKE ? ORDER BY case_id DESC LIMIT 25').all(guildId, `%${partial}%`).map((row) => ({ caseId: row.case_id, action: row.action, status: row.status, userId: row.user_id })); }
function getCaseCountForUser(guildId, userId) { return db.prepare('SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND user_id = ?').get(guildId, userId).count; }

function updateAndEmit(guildId, caseId, sql, params, emitter) {
  const updatedAt = new Date().toISOString();
  const result = db.prepare(sql).run(...params, updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) emitter(guildId, updated);
  return updated;
}
function updateCaseReason(guildId, caseId, newReason) { return updateAndEmit(guildId, caseId, 'UPDATE cases SET reason = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [newReason], emitCaseUpdated); }
function updateCaseStatus(guildId, caseId, status) { return updateAndEmit(guildId, caseId, 'UPDATE cases SET status = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [status], emitCaseStatusUpdated); }
function updateCaseNote(guildId, caseId, note) { return updateAndEmit(guildId, caseId, 'UPDATE cases SET note = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [String(note || '').trim()], emitCaseNoteUpdated); }
function clearCaseNote(guildId, caseId) {
  const updatedAt = new Date().toISOString();
  const result = db.prepare('UPDATE cases SET note = NULL, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId); if (updated) emitCaseNoteUpdated(guildId, updated); return updated;
}

module.exports = { EVENTS, emit, emitCaseCreated, emitCaseUpdated, emitCaseStatusUpdated, emitCaseNoteUpdated, createCase, getCasesForUser, getFilteredCases, getCasesByModerator, searchCaseIds, getCaseCountForUser, getCaseById, getAllCases, updateCaseReason, updateCaseStatus, updateCaseNote, clearCaseNote };
