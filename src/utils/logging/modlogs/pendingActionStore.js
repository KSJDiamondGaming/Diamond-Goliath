const crypto = require('crypto');
const db = require('./db');

function purgeExpired(guildId) {
  const nowIso = new Date().toISOString();

  const stmt = db.prepare(`
    DELETE FROM pending_actions
    WHERE guild_id = ? AND expires_at <= ?
  `);

  stmt.run(guildId, nowIso);
}

function createPendingAction(guildId, action) {
  purgeExpired(guildId);

  const token = crypto.randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    INSERT INTO pending_actions (
      token, guild_id, moderator_id, target_id, type, payload, created_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    token,
    guildId,
    action.moderatorId,
    action.targetId,
    action.type,
    JSON.stringify(action.payload || {}),
    createdAt,
    expiresAt
  );

  return token;
}

function getPendingAction(guildId, token) {
  purgeExpired(guildId);

  const stmt = db.prepare(`
    SELECT * FROM pending_actions
    WHERE guild_id = ? AND token = ?
  `);

  const row = stmt.get(guildId, token);
  if (!row) return null;

  return {
    token: row.token,
    moderatorId: row.moderator_id,
    targetId: row.target_id,
    type: row.type,
    payload: row.payload ? JSON.parse(row.payload) : {},
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function deletePendingAction(guildId, token) {
  const stmt = db.prepare(`
    DELETE FROM pending_actions
    WHERE guild_id = ? AND token = ?
  `);

  stmt.run(guildId, token);
}

module.exports = {
  createPendingAction,
  getPendingAction,
  deletePendingAction
};