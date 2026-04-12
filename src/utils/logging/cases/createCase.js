const { addCase } = require('./caseStore');

function toSafeUser(user) {
  if (!user) {
    return {
      id: 'unknown',
      tag: 'Unknown User',
    };
  }

  return {
    id: user.id || 'unknown',
    tag: user.tag || user.username || 'Unknown User',
  };
}

function createCase({
  guild,
  action,
  target,
  moderator,
  reason = 'No reason provided.',
  duration = null,
  evidence = null,
  active = true,
  expiresAt = null,
}) {
  if (!guild?.id) {
    throw new Error('createCase requires a valid guild.');
  }

  return addCase(guild.id, {
    action: String(action || 'Unknown'),
    target: toSafeUser(target),
    moderator: toSafeUser(moderator),
    reason: String(reason || 'No reason provided.'),
    duration: duration ? String(duration) : null,
    evidence: evidence ? String(evidence) : null,
    active: Boolean(active),
    expiresAt: expiresAt || null,
  });
}

module.exports = {
  createCase,
};