const db = require('./db');

function mapCase(row) {
  if (!row) return null;

  return {
    caseId: row.case_id,
    guildId: row.guild_id,
    userId: row.user_id,
    moderatorId: row.moderator_id,
    action: row.action,
    reason: row.reason,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    status: row.status,
    relatedCaseId: row.related_case_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createCase({
  guildId,
  userId,
  moderatorId,
  action,
  reason,
  metadata = {},
  status = 'active',
  relatedCaseId = null
}) {
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO cases (
      guild_id, user_id, moderator_id, action, reason, metadata,
      status, related_case_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);

  const result = stmt.run(
    guildId,
    userId,
    moderatorId,
    action,
    reason,
    JSON.stringify(metadata || {}),
    status,
    relatedCaseId,
    createdAt
  );

  return getCaseById(guildId, result.lastInsertRowid);
}

function getCasesForUser(guildId, userId) {
  const stmt = db.prepare(`
    SELECT * FROM cases
    WHERE guild_id = ? AND user_id = ?
    ORDER BY case_id DESC
  `);

  return stmt.all(guildId, userId).map(mapCase);
}

function getFilteredCases(guildId, userId, filters = {}) {
  let query = `SELECT * FROM cases WHERE guild_id = ? AND user_id = ?`;
  const params = [guildId, userId];

  if (filters.action) {
    query += ` AND action = ?`;
    params.push(filters.action);
  }

  if (filters.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY case_id DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params).map(mapCase);
}

function getCasesByModerator(guildId, moderatorId, filters = {}) {
  let query = `SELECT * FROM cases WHERE guild_id = ? AND moderator_id = ?`;
  const params = [guildId, moderatorId];

  if (filters.action) {
    query += ` AND action = ?`;
    params.push(filters.action);
  }

  if (filters.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY case_id DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params).map(mapCase);
}

function getAllCases(guildId) {
  const guildCases = ensureGuildCases(guildId);

  return [...guildCases].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function searchCaseIds(guildId, partial = '') {
  const like = `%${partial}%`;
  const stmt = db.prepare(`
    SELECT case_id, action, status, user_id
    FROM cases
    WHERE guild_id = ?
      AND CAST(case_id AS TEXT) LIKE ?
    ORDER BY case_id DESC
    LIMIT 25
  `);

  return stmt.all(guildId, like).map(row => ({
    caseId: row.case_id,
    action: row.action,
    status: row.status,
    userId: row.user_id
  }));
}

function getCaseCountForUser(guildId, userId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM cases
    WHERE guild_id = ? AND user_id = ?
  `);

  return stmt.get(guildId, userId).count;
}

function getCaseById(guildId, caseId) {
  const stmt = db.prepare(`
    SELECT * FROM cases
    WHERE guild_id = ? AND case_id = ?
  `);

  return mapCase(stmt.get(guildId, Number(caseId)));
}

function updateCaseReason(guildId, caseId, newReason) {
  const updatedAt = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE cases
    SET reason = ?, updated_at = ?
    WHERE guild_id = ? AND case_id = ?
  `);

  const result = stmt.run(newReason, updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;

  return getCaseById(guildId, caseId);
}

function updateCaseStatus(guildId, caseId, status) {
  const updatedAt = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE cases
    SET status = ?, updated_at = ?
    WHERE guild_id = ? AND case_id = ?
  `);

  const result = stmt.run(status, updatedAt, guildId, Number(caseId));
  if (!result.changes) return null;

  return getCaseById(guildId, caseId);
}

function updateCaseNote(guildId, caseId, note) {
  const guildCases = ensureGuildCases(guildId);
  const existingCase = guildCases.find(entry => entry.caseId === Number(caseId));

  if (!existingCase) return null;

  existingCase.note = String(note || '').trim();
  existingCase.updatedAt = new Date().toISOString();

  saveStore();
  return existingCase;
}

function clearCaseNote(guildId, caseId) {
  const guildCases = ensureGuildCases(guildId);
  const existingCase = guildCases.find(entry => entry.caseId === Number(caseId));

  if (!existingCase) return null;

  delete existingCase.note;
  existingCase.updatedAt = new Date().toISOString();

  saveStore();
  return existingCase;
}

module.exports = {
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
  clearCaseNote
};