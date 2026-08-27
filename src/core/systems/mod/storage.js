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
  CREATE INDEX IF NOT EXISTS idx_cases_guild_user ON cases(guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_cases_guild_case ON cases(guild_id, case_id);
  CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_warnings_guild_case ON warnings(guild_id, case_id);
  CREATE INDEX IF NOT EXISTS idx_pending_guild_token ON pending_actions(guild_id, token);
`);

const caseColumns = new Set(db.pragma('table_info(cases)').map((column) => column.name));
if (!caseColumns.has('note')) db.exec('ALTER TABLE cases ADD COLUMN note TEXT');

const EVENTS = Object.freeze({
  CASE_CREATED: 'case.created',
  CASE_UPDATED: 'case.updated',
  CASE_STATUS_UPDATED: 'case.status.updated',
  CASE_NOTE_UPDATED: 'case.note.updated',
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
  const createdAt = now();
  const result = db.prepare(`INSERT INTO cases (guild_id, user_id, moderator_id, action, reason, metadata, status, related_case_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`).run(guildId, userId, moderatorId, action, reason, JSON.stringify(metadata || {}), status, relatedCaseId, createdAt);
  const created = getCaseById(guildId, result.lastInsertRowid);
  if (created) emitCaseCreated(guildId, created);
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
function getCaseCountForUser(guildId, userId) { return db.prepare('SELECT COUNT(*) AS count FROM cases WHERE guild_id = ? AND user_id = ?').get(guildId, userId).count; }
function updateAndEmit(guildId, caseId, sql, params, emitter) {
  const updatedAt = now();
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
  const updatedAt = now();
  const result = db.prepare('UPDATE cases SET note = NULL, updated_at = ? WHERE guild_id = ? AND case_id = ?').run(updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;
  const updated = getCaseById(guildId, caseId);
  if (updated) emitCaseNoteUpdated(guildId, updated);
  return updated;
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
  createCase,
  getCasesForUser,
  getFilteredCases,
  getCasesByModerator,
  searchCaseIds,
  getCaseCountForUser,
  getCaseById,
  getAllCases,
  updateCaseReason,
  updateCaseStatus,
  updateCaseNote,
  clearCaseNote,
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
