const {
  addWarning,
  getWarningById,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings,
} = require('../../../core/logging/warnings/warningStore');
const { updateCaseStatus } = require('../../../core/logging/cases/caseStore');
const {
  handleEscalation,
  getRepeatReasonInfo,
} = require('../../../features/moderation/functions/escalationSystem');

function parseWarningExpiry(value) {
  const raw = String(value || 'never').trim().toLowerCase();
  if (!raw || raw === 'never' || raw === 'none') return null;

  const match = raw.match(/^(\d+)\s*([dwm])$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const now = new Date();
  if (match[2] === 'm') {
    const expiry = new Date(now);
    expiry.setUTCMonth(expiry.getUTCMonth() + amount);
    return expiry.toISOString();
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const multiplier = match[2] === 'w' ? 7 * dayMs : dayMs;
  return new Date(now.getTime() + (amount * multiplier)).toISOString();
}

async function syncExpiredWarningsToCases(guildId) {
  const expiredWarnings = purgeExpiredWarnings(guildId) || [];

  for (const warning of expiredWarnings) {
    if (warning?.caseId) {
      updateCaseStatus(guildId, warning.caseId, 'expired');
    }
  }

  return expiredWarnings;
}

function createWarning({
  guildId,
  userId,
  moderatorId,
  reason = 'No reason provided',
  caseId,
  expiresAt = null,
}) {
  return addWarning({
    guildId,
    userId,
    moderatorId,
    reason,
    caseId,
    expiresAt,
  });
}

function removeWarningByCaseId(guildId, caseId) {
  const warning = getWarningByCaseId(guildId, caseId);
  if (!warning) return null;

  const removed = deleteWarningByCaseId(guildId, caseId);
  if (!removed) return null;

  updateCaseStatus(guildId, caseId, 'reversed');
  return warning;
}

async function getWarningContext({ guildId, userId, reason }) {
  let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };

  try {
    repeatInfo = getRepeatReasonInfo({ guildId, userId, reason }) || repeatInfo;
  } catch (error) {
    console.error('❌ Warning repeat-reason check failed:', error);
  }

  return {
    count: getWarningCountForUser(guildId, userId),
    repeatInfo,
  };
}

async function runWarningEscalation({ guild, member, moderator, reason }) {
  try {
    return await handleEscalation({ guild, member, moderator, reason });
  } catch (error) {
    console.error('❌ Warning escalation failed:', error);
    return null;
  }
}

module.exports = {
  parseWarningExpiry,
  syncExpiredWarningsToCases,
  createWarning,
  removeWarningByCaseId,
  getWarningContext,
  runWarningEscalation,
  getWarningById,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  purgeExpiredWarnings,
};
