'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const { resolveRuntimePath } = require('../../../config/runtimePaths');
const guildManager = require('../../guild/guildManager');
const { emitGuildUpdate } = require('../../../server/sockets/socketHub');

const dataDir = resolveRuntimePath(process.env.BOT_MODE, 'database');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'moderation.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    case_id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    metadata TEXT,
    status TEXT DEFAULT 'active',
    related_case_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    case_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS pending_actions (
    token TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    case_id INTEGER NOT NULL,
    actor_id TEXT,
    event TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cases_guild_user ON cases(guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_cases_guild_case ON cases(guild_id, case_id);
  CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_warnings_guild_case ON warnings(guild_id, case_id);
  CREATE INDEX IF NOT EXISTS idx_pending_guild_token ON pending_actions(guild_id, token);
  CREATE INDEX IF NOT EXISTS idx_case_audit_guild_case ON case_audit(guild_id, case_id, audit_id DESC);
  CREATE INDEX IF NOT EXISTS idx_case_audit_guild_actor ON case_audit(guild_id, actor_id, audit_id DESC);
`);

const caseColumns = new Set(db.pragma('table_info(cases)').map((column) => column.name));
if (!caseColumns.has('note')) db.exec('ALTER TABLE cases ADD COLUMN note TEXT');

const EVENTS = Object.freeze({
  CASE_CREATED: 'case.created',
  CASE_UPDATED: 'case.updated',
  CASE_STATUS_UPDATED: 'case.status.updated',
  CASE_NOTE_UPDATED: 'case.note.updated',
  CASE_TAGS_UPDATED: 'case.tags.updated',
  CASE_RELATION_LINKED: 'case.relationship.linked',
  CASE_RELATION_UNLINKED: 'case.relationship.unlinked',
});

function now() { return new Date().toISOString(); }
function createPayload(event, guildId, data = {}) {
  const timestamp = now();
  return { module: 'cases', event, guildId: String(guildId), timestamp, updatedAt: timestamp, data };
}
function emit(event, guildId, data = {}) {
  const payload = createPayload(event, guildId, data);
  return emitGuildUpdate(guildId, payload) || payload;
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
function emitCaseCreated(guildId, record) { return emit(EVENTS.CASE_CREATED, guildId, casePayload(record)); }
function emitCaseUpdated(guildId, record) { return emit(EVENTS.CASE_UPDATED, guildId, casePayload(record)); }
function emitCaseStatusUpdated(guildId, record) { return emit(EVENTS.CASE_STATUS_UPDATED, guildId, casePayload(record)); }
function emitCaseNoteUpdated(guildId, record) { return emit(EVENTS.CASE_NOTE_UPDATED, guildId, casePayload(record)); }

function parseMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function serializeAuditValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}
function parseAuditValue(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch { return value; }
}
function mapAudit(row) {
  if (!row) return null;
  return {
    auditId: row.audit_id,
    guildId: row.guild_id,
    caseId: row.case_id,
    actorId: row.actor_id || null,
    event: row.event,
    before: parseAuditValue(row.before_value),
    after: parseAuditValue(row.after_value),
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}
function recordCaseAudit({ guildId, caseId, actorId = null, event, before = null, after = null, metadata = {} }) {
  if (!guildId || !caseId || !event) return null;
  const result = db.prepare(`INSERT INTO case_audit (guild_id, case_id, actor_id, event, before_value, after_value, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    String(guildId), Number(caseId), actorId ? String(actorId) : null, String(event), serializeAuditValue(before), serializeAuditValue(after), JSON.stringify(metadata || {}), now()
  );
  return mapAudit(db.prepare('SELECT * FROM case_audit WHERE audit_id = ?').get(result.lastInsertRowid));
}
function getCaseAudit(guildId, caseId, { page = 0, pageSize = 25 } = {}) {
  const normalizedGuildId = String(guildId || '').trim();
  const normalizedCaseId = Number(caseId);
  if (!normalizedGuildId || !Number.isInteger(normalizedCaseId) || normalizedCaseId <= 0) return { results: [], total: 0, page: 0, pageSize: 25, totalPages: 0 };
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const total = db.prepare('SELECT COUNT(*) AS count FROM case_audit WHERE guild_id = ? AND case_id = ?').get(normalizedGuildId, normalizedCaseId).count;
  const totalPages = Math.ceil(total / safePageSize);
  const safePage = Math.max(0, Math.min(Math.trunc(Number(page) || 0), Math.max(0, totalPages - 1)));
  const rows = db.prepare('SELECT * FROM case_audit WHERE guild_id = ? AND case_id = ? ORDER BY audit_id DESC LIMIT ? OFFSET ?').all(normalizedGuildId, normalizedCaseId, safePageSize, safePage * safePageSize);
  return { results: rows.map(mapAudit), total, page: safePage, pageSize: safePageSize, totalPages };
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
function createCase({ guildId, userId, moderatorId, action, reason, metadata = {}, status = 'active', relatedCaseId = null, actorId = null }) {
  const createdAt = now();
  const result = db.prepare(`INSERT INTO cases (guild_id, user_id, moderator_id, action, reason, metadata, status, related_case_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`).run(guildId, userId, moderatorId, action, reason, JSON.stringify(metadata || {}), status, relatedCaseId, createdAt);
  const created = getCaseById(guildId, result.lastInsertRowid);
  if (created) {
    recordCaseAudit({ guildId, caseId: created.caseId, actorId: actorId || moderatorId, event: EVENTS.CASE_CREATED, before: null, after: created, metadata: { action } });
    emitCaseCreated(guildId, created);
  }
  return created;
}
function getCaseById(guildId, caseId) { return mapCase(db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_id = ?').get(guildId, Number(caseId))); }
function getCasesForUser(guildId, userId) { return db.prepare('SELECT * FROM cases WHERE guild_id = ? AND user_id = ? ORDER BY case_id DESC').all(guildId, userId).map(mapCase); }
function getCasesByModerator(guildId, moderatorId, filters = {}) {
  let query = 'SELECT * FROM cases WHERE guild_id = ? AND moderator_id = ?';
  const params = [guildId, moderatorId];
  if (filters.action) { query += ' AND action = ?'; params.push(filters.action); }
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  return db.prepare(`${query} ORDER BY case_id DESC`).all(...params).map(mapCase);
}
function getFilteredCases(guildId, userId, filters = {}) {
  let query = 'SELECT * FROM cases WHERE guild_id = ? AND user_id = ?';
  const params = [guildId, userId];
  if (filters.action) { query += ' AND action = ?'; params.push(filters.action); }
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  return db.prepare(`${query} ORDER BY case_id DESC`).all(...params).map(mapCase);
}
function getAllCases(guildId) { return db.prepare('SELECT * FROM cases WHERE guild_id = ? ORDER BY case_id DESC').all(guildId).map(mapCase); }
function searchCaseIds(guildId, partial = '') {
  return db.prepare('SELECT case_id, action, status, user_id FROM cases WHERE guild_id = ? AND CAST(case_id AS TEXT) LIKE ? ORDER BY case_id DESC LIMIT 25').all(guildId, `%${partial}%`).map((row) => ({ caseId: row.case_id, action: row.action, status: row.status, userId: row.user_id }));
}
function searchCases(guildId, filters = {}) {
  const normalizedGuildId = String(guildId || '').trim();
  if (!normalizedGuildId) return { results: [], total: 0, page: 0, pageSize: 25, totalPages: 0 };
  const conditions = ['guild_id = ?'];
  const params = [normalizedGuildId];
  const addValue = (condition, value) => { conditions.push(condition); params.push(value); };
  if (filters.caseId !== undefined && filters.caseId !== null && String(filters.caseId).trim() !== '') {
    const caseId = Number(filters.caseId);
    if (Number.isInteger(caseId) && caseId > 0) addValue('case_id = ?', caseId);
    else return { results: [], total: 0, page: 0, pageSize: 25, totalPages: 0 };
  }
  if (filters.userId) addValue('user_id = ?', String(filters.userId).trim());
  if (filters.moderatorId) addValue('moderator_id = ?', String(filters.moderatorId).trim());
  if (filters.action) addValue('action = ?', String(filters.action).trim());
  if (filters.status) addValue('status = ?', String(filters.status).trim());
  const text = String(filters.text || '').trim();
  if (text) {
    const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push("(COALESCE(reason, '') LIKE ? ESCAPE '\\' OR COALESCE(note, '') LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern);
  }
  const createdFrom = filters.createdFrom ? String(filters.createdFrom).trim() : '';
  const createdTo = filters.createdTo ? String(filters.createdTo).trim() : '';
  const updatedFrom = filters.updatedFrom ? String(filters.updatedFrom).trim() : '';
  const updatedTo = filters.updatedTo ? String(filters.updatedTo).trim() : '';
  if (createdFrom) addValue('created_at >= ?', createdFrom);
  if (createdTo) addValue('created_at <= ?', createdTo);
  if (updatedFrom) addValue('updated_at >= ?', updatedFrom);
  if (updatedTo) addValue('updated_at <= ?', updatedTo);
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM cases WHERE ${where}`).get(...params).count;
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.max(0, Math.min(Math.trunc(Number(filters.page) || 0), Math.max(0, totalPages - 1)));
  const offset = page * pageSize;
  const rows = db.prepare(`SELECT * FROM cases WHERE ${where} ORDER BY case_id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return { results: rows.map(mapCase), total, page, pageSize, totalPages };
}
function getCaseCountForUser(guildId, userId) { return db.prepare('SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND user_id = ?').get(guildId, userId).count; }
function updateAndEmit(guildId, caseId, sql, params, emitter, auditEvent, actorId = null, before = null) {
  const updatedAt = now();
  const result = db.prepare(sql).run(...params, updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) {
    recordCaseAudit({ guildId, caseId, actorId, event: auditEvent, before, after: updated, metadata: {} });
    emitter(guildId, updated);
  }
  return updated;
}
function updateCaseReason(guildId, caseId, newReason, actorId = null) {
  const before = getCaseById(guildId, caseId);
  return updateAndEmit(guildId, caseId, 'UPDATE cases SET reason = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [newReason], emitCaseUpdated, 'case.reason.updated', actorId, before ? before.reason : null);
}
function updateCaseStatus(guildId, caseId, status, actorId = null) {
  const before = getCaseById(guildId, caseId);
  return updateAndEmit(guildId, caseId, 'UPDATE cases SET status = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [status], emitCaseStatusUpdated, EVENTS.CASE_STATUS_UPDATED, actorId, before ? before.status : null);
}
function updateCaseNote(guildId, caseId, note, actorId = null) {
  const before = getCaseById(guildId, caseId);
  return updateAndEmit(guildId, caseId, 'UPDATE cases SET note = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?', [String(note || '').trim()], emitCaseNoteUpdated, EVENTS.CASE_NOTE_UPDATED, actorId, before ? before.note : null);
}
function clearCaseNote(guildId, caseId, actorId = null) {
  const before = getCaseById(guildId, caseId);
  const updatedAt = now();
  const result = db.prepare('UPDATE cases SET note = NULL, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) {
    recordCaseAudit({ guildId, caseId, actorId, event: EVENTS.CASE_NOTE_UPDATED, before: before ? before.note : null, after: null, metadata: { cleared: true } });
    emitCaseNoteUpdated(guildId, updated);
  }
  return updated;
}
function normalizeCaseTags(tags) {
  const source = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set();
  const normalized = [];
  for (const raw of source) {
    const tag = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= 10) break;
  }
  return normalized;
}
function updateCaseTags(guildId, caseId, tags, actorId = null) {
  const existing = getCaseById(guildId, caseId);
  if (!existing) return null;
  const before = normalizeCaseTags(existing.metadata?.tags || []);
  const after = normalizeCaseTags(tags);
  const metadata = { ...(existing.metadata || {}) };
  if (after.length) metadata.tags = after;
  else delete metadata.tags;
  const updatedAt = now();
  const result = db.prepare('UPDATE cases SET metadata = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(JSON.stringify(metadata), updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) {
    recordCaseAudit({ guildId, caseId, actorId, event: EVENTS.CASE_TAGS_UPDATED, before, after, metadata: { tagCount: after.length } });
    emitCaseUpdated(guildId, updated);
  }
  return updated;
}
function normalizeCaseId(value) {
  const caseId = Number(value);
  return Number.isInteger(caseId) && caseId > 0 ? caseId : null;
}
function linkCases(guildId, caseId, relatedCaseId, actorId = null) {
  const primaryId = normalizeCaseId(caseId);
  const relatedId = normalizeCaseId(relatedCaseId);
  if (!primaryId || !relatedId) return { ok: false, error: 'Case IDs must be positive integers.' };
  if (primaryId === relatedId) return { ok: false, error: 'A case cannot be linked to itself.' };
  const primary = getCaseById(guildId, primaryId);
  const related = getCaseById(guildId, relatedId);
  if (!primary || !related) return { ok: false, error: 'Both cases must exist in this guild.' };
  if (primary.relatedCaseId && primary.relatedCaseId !== relatedId) return { ok: false, error: `Case #${primaryId} is already linked to Case #${primary.relatedCaseId}.` };
  if (related.relatedCaseId && related.relatedCaseId !== primaryId) return { ok: false, error: `Case #${relatedId} is already linked to Case #${related.relatedCaseId}.` };
  if (primary.relatedCaseId === relatedId && related.relatedCaseId === primaryId) return { ok: true, case: primary, relatedCase: related, changed: false };
  const updatedAt = now();
  db.transaction(() => {
    db.prepare('UPDATE cases SET related_case_id = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(relatedId, updatedAt, guildId, primaryId);
    db.prepare('UPDATE cases SET related_case_id = ?, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(primaryId, updatedAt, guildId, relatedId);
    recordCaseAudit({ guildId, caseId: primaryId, actorId, event: EVENTS.CASE_RELATION_LINKED, before: primary.relatedCaseId || null, after: relatedId, metadata: { relatedCaseId: relatedId } });
    recordCaseAudit({ guildId, caseId: relatedId, actorId, event: EVENTS.CASE_RELATION_LINKED, before: related.relatedCaseId || null, after: primaryId, metadata: { relatedCaseId: primaryId } });
  })();
  const updatedPrimary = getCaseById(guildId, primaryId);
  const updatedRelated = getCaseById(guildId, relatedId);
  if (updatedPrimary) emitCaseUpdated(guildId, updatedPrimary);
  if (updatedRelated) emitCaseUpdated(guildId, updatedRelated);
  return { ok: Boolean(updatedPrimary && updatedRelated), case: updatedPrimary, relatedCase: updatedRelated, changed: true };
}
function unlinkCaseRelationship(guildId, caseId, actorId = null) {
  const primaryId = normalizeCaseId(caseId);
  if (!primaryId) return { ok: false, error: 'Case ID must be a positive integer.' };
  const primary = getCaseById(guildId, primaryId);
  if (!primary) return { ok: false, error: 'Case not found in this guild.' };
  const relatedId = normalizeCaseId(primary.relatedCaseId);
  if (!relatedId) return { ok: true, case: primary, relatedCase: null, changed: false };
  const related = getCaseById(guildId, relatedId);
  const updatedAt = now();
  db.transaction(() => {
    db.prepare('UPDATE cases SET related_case_id = NULL, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(updatedAt, guildId, primaryId);
    recordCaseAudit({ guildId, caseId: primaryId, actorId, event: EVENTS.CASE_RELATION_UNLINKED, before: relatedId, after: null, metadata: { relatedCaseId: relatedId } });
    if (related && related.relatedCaseId === primaryId) {
      db.prepare('UPDATE cases SET related_case_id = NULL, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(updatedAt, guildId, relatedId);
      recordCaseAudit({ guildId, caseId: relatedId, actorId, event: EVENTS.CASE_RELATION_UNLINKED, before: primaryId, after: null, metadata: { relatedCaseId: primaryId } });
    }
  })();
  const updatedPrimary = getCaseById(guildId, primaryId);
  const updatedRelated = related ? getCaseById(guildId, relatedId) : null;
  if (updatedPrimary) emitCaseUpdated(guildId, updatedPrimary);
  if (updatedRelated && related.relatedCaseId === primaryId) emitCaseUpdated(guildId, updatedRelated);
  return { ok: Boolean(updatedPrimary), case: updatedPrimary, relatedCase: updatedRelated, changed: true };
}

function mapWarning(row) {
  if (!row) return null;
  return { id: row.id, guildId: row.guild_id, userId: row.user_id, moderatorId: row.moderator_id, reason: row.reason, caseId: row.case_id, createdAt: row.created_at, expiresAt: row.expires_at };
}
function addWarning({ guildId, userId, moderatorId, reason = 'No reason provided', caseId, expiresAt = null }) {
  const normalizedCaseId = Number(caseId);
  if (!Number.isInteger(normalizedCaseId) || normalizedCaseId <= 0) throw new Error('Warning case ID must be a positive integer.');
  const result = db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, case_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, moderatorId, reason, normalizedCaseId, now(), expiresAt);
  return getWarningById(result.lastInsertRowid);
}
function getWarningById(id) { return mapWarning(db.prepare('SELECT * FROM warnings WHERE id = ?').get(Number(id))); }
function purgeExpiredWarnings(guildId) {
  const nowIso = now();
  const expired = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND expires_at IS NOT NULL AND expires_at <= ?').all(guildId, nowIso).map(mapWarning);
  db.prepare('DELETE FROM warnings WHERE guild_id = ? AND expires_at IS NOT NULL AND expires_at <= ?').run(guildId, nowIso);
  return expired;
}
function getWarningsForUser(guildId, userId) { purgeExpiredWarnings(guildId); return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY datetime(created_at) DESC').all(guildId, userId).map(mapWarning); }
function getWarningCountForUser(guildId, userId) { purgeExpiredWarnings(guildId); return db.prepare('SELECT COUNT(*) AS count FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId).count; }
function getWarningByCaseId(guildId, caseId) { purgeExpiredWarnings(guildId); return mapWarning(db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND case_id = ?').get(guildId, Number(caseId))); }
function deleteWarningByCaseId(guildId, caseId) { purgeExpiredWarnings(guildId); return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND case_id = ?').run(guildId, Number(caseId)).changes > 0; }

const MODERATION_ACTION_LABELS = { delete: 'Message Deleted', warn: 'User Warned', dm: 'User Warned by DM', 'warn-dm': 'User Warned & DM Sent', timeout: 'User Timed Out', mute: 'User Muted', unmute: 'User Unmuted', kick: 'User Kicked', ban: 'User Banned', unban: 'User Unbanned', tempban: 'User Temporarily Banned', tempmute: 'User Temporarily Muted', automod: 'AutoMod Action Taken' };
function normalizeLogType(logType = 'mod') {
  const type = String(logType || 'general').toLowerCase();
  if (type === 'mod' || type === 'moderation') return 'moderation';
  if (type === 'automod') return 'automod';
  if (type === 'admin') return 'admin';
  return 'general';
}
function getEventName(channelType) { return channelType === 'automod' ? 'automodActions' : channelType === 'admin' ? 'adminActions' : 'moderationActions'; }
function formatModerationAction(action) { return (Array.isArray(action) ? action : [action]).filter(Boolean).map((item) => MODERATION_ACTION_LABELS[String(item).toLowerCase()] || String(item)).join(', '); }
function formatUser(user, fallback = 'Unknown User') {
  if (!user) return fallback;
  const realUser = user.user || user;
  const name = realUser.tag || realUser.username || realUser.displayName || realUser.name || fallback;
  return `${name} (${realUser.id || user.id || 'N/A'})`;
}
function normalizeDetails(details = []) {
  if (!Array.isArray(details)) return [];
  return details.filter((detail) => detail && detail.name && detail.value !== undefined && detail.value !== null).map((detail) => ({ name: String(detail.name).slice(0, 256), value: String(detail.value).slice(0, 1024), inline: Boolean(detail.inline) }));
}
async function resolveLogChannel(guild, channelType) {
  const logChannelId = guildManager.getLogChannelId(guild.id, channelType, 'general');
  if (!logChannelId) return null;
  const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}
async function logModerationAction({ guild, action, user = null, target = null, moderator = null, reason = 'No reason provided', duration = null, color = '#5865F2', caseId = null, details = [], metadata = {}, title = null, logType = 'mod' }) {
  if (!guild?.id) return false;
  try {
    const channelType = normalizeLogType(logType);
    if (typeof guildManager.isLogEventEnabled === 'function' && !guildManager.isLogEventEnabled(guild.id, getEventName(channelType))) return false;
    const channel = await resolveLogChannel(guild, channelType);
    if (!channel) return false;
    const targetUser = target || user;
    const fields = [];
    if (targetUser) fields.push({ name: 'User', value: formatUser(targetUser), inline: false });
    fields.push({ name: 'Moderator', value: moderator ? formatUser(moderator, 'Unknown Moderator') : 'System', inline: false });
    if (reason) fields.push({ name: 'Reason', value: String(reason).slice(0, 1024), inline: false });
    if (duration) fields.push({ name: 'Duration', value: String(duration).slice(0, 1024), inline: false });
    if (caseId) fields.push({ name: 'Case ID', value: `#${caseId}`, inline: false });
    if (metadata?.dmSent !== undefined) fields.push({ name: 'DM Status', value: metadata.dmSent ? 'Sent ✅' : 'Failed ❌', inline: true });
    if (metadata?.punishmentReport) {
      fields.push({ name: 'Punishments Applied', value: metadata.punishmentReport.actionText || 'none', inline: true });
      if (metadata.punishmentReport.failedText && metadata.punishmentReport.failedText !== 'none') fields.push({ name: 'Punishments Failed', value: metadata.punishmentReport.failedText, inline: true });
    }
    fields.push(...normalizeDetails(details));
    const embed = new EmbedBuilder().setColor(color).setTitle(String(title || `🔐 ${formatModerationAction(action) || 'Moderation Action'}`).slice(0, 256)).setTimestamp();
    if (fields.length) embed.addFields(fields.slice(0, 25));
    const avatarTarget = (targetUser || moderator)?.user || targetUser || moderator;
    if (avatarTarget && typeof avatarTarget.displayAvatarURL === 'function') embed.setThumbnail(avatarTarget.displayAvatarURL({ dynamic: true }));
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(`Failed to log moderation action in guild ${guild?.id || 'unknown'}:`, error);
    return false;
  }
}
async function sendModLog(payload = {}) { return logModerationAction({ ...payload, user: payload.user || payload.target || null, logType: payload.logType || 'mod' }); }

module.exports = {
  db,
  EVENTS,
  emit,
  emitCaseCreated,
  emitCaseUpdated,
  emitCaseStatusUpdated,
  emitCaseNoteUpdated,
  recordCaseAudit,
  getCaseAudit,
  createCase,
  getCasesForUser,
  getFilteredCases,
  getCasesByModerator,
  searchCaseIds,
  searchCases,
  getCaseCountForUser,
  getCaseById,
  getAllCases,
  updateCaseReason,
  updateCaseStatus,
  updateCaseNote,
  clearCaseNote,
  updateCaseTags,
  linkCases,
  unlinkCaseRelationship,
  addWarning,
  getWarningById,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings,
  logModerationAction,
  sendModLog,
};