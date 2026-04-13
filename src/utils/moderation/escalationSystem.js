const { getWarningsForUser, getWarningCountForUser } = require('../../utils/logging/modlogs/warningStore');
const { createCase } = require('../../utils/logging/cases/caseStore');
const { sendModLog } = require('../../utils/logging/modlogs/modLog');

function getEscalationConfig() {
  return {
    2: { action: 'timeout', duration: '10m' },
    3: { action: 'timeout', duration: '1h' },
    4: { action: 'kick' },
    5: { action: 'ban', deleteDays: 0 }
  };
}

function parseDuration(input) {
  const match = String(input || '').trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];

  const map = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * map[unit];
}

function normalizeReason(reason) {
  return String(reason || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getRepeatReasonInfo(guildId, userId, reason) {
  const warnings = getWarningsForUser(guildId, userId);
  const normalized = normalizeReason(reason);

  const matches = warnings.filter(entry => normalizeReason(entry.reason) === normalized);
  return {
    repeatCount: matches.length,
    isRepeatPattern: matches.length >= 2
  };
}

function getNextEscalationPreview(guildId, userId) {
  const warningCount = getWarningCountForUser(guildId, userId);
  const config = getEscalationConfig();
  const next = config[warningCount + 1];

  if (!next) {
    return 'No automatic escalation configured';
  }

  if (next.action === 'timeout') {
    return `Timeout (${next.duration}) at ${warningCount + 1} warnings`;
  }

  if (next.action === 'ban') {
    return `Ban at ${warningCount + 1} warnings`;
  }

  if (next.action === 'kick') {
    return `Kick at ${warningCount + 1} warnings`;
  }

  return `Escalation at ${warningCount + 1} warnings`;
}

async function handleEscalation({ guild, member, moderator, reason }) {
  const warningCount = getWarningCountForUser(guild.id, member.id);
  const config = getEscalationConfig();

  let escalation = config[warningCount];
  const repeatInfo = getRepeatReasonInfo(guild.id, member.id, reason);

  if (!escalation && repeatInfo.isRepeatPattern) {
    escalation = { action: 'timeout', duration: '10m', repeatTriggered: true };
  }

  if (!escalation) return null;

  const baseReason = escalation.repeatTriggered
    ? `Auto escalation (repeat behavior detected)`
    : `Auto escalation (${warningCount} warnings)`;

  const finalReason = `${baseReason}${reason ? ` | ${reason}` : ''}`;

  try {
    if (escalation.action === 'timeout') {
      const durationMs = parseDuration(escalation.duration);
      if (!durationMs) return null;

      await member.timeout(durationMs, finalReason);

      const modCase = createCase({
        guildId: guild.id,
        userId: member.id,
        moderatorId: moderator.id,
        action: 'timeout',
        reason: finalReason,
        metadata: {
          auto: true,
          duration: escalation.duration,
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      await sendModLog({
        guild,
        target: member,
        moderator,
        action: 'Auto Timeout',
        reason: finalReason,
        caseId: modCase.caseId,
        metadata: {
          duration: escalation.duration,
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      return modCase;
    }

    if (escalation.action === 'kick') {
      await member.kick(finalReason);

      const modCase = createCase({
        guildId: guild.id,
        userId: member.id,
        moderatorId: moderator.id,
        action: 'kick',
        reason: finalReason,
        metadata: {
          auto: true,
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      await sendModLog({
        guild,
        target: member,
        moderator,
        action: 'Auto Kick',
        reason: finalReason,
        caseId: modCase.caseId,
        metadata: {
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      return modCase;
    }

    if (escalation.action === 'ban') {
      await member.ban({
        deleteMessageSeconds: (escalation.deleteDays || 0) * 24 * 60 * 60,
        reason: finalReason
      });

      const modCase = createCase({
        guildId: guild.id,
        userId: member.id,
        moderatorId: moderator.id,
        action: 'ban',
        reason: finalReason,
        metadata: {
          auto: true,
          deleteDays: escalation.deleteDays || 0,
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      await sendModLog({
        guild,
        target: member,
        moderator,
        action: 'Auto Ban',
        reason: finalReason,
        caseId: modCase.caseId,
        metadata: {
          deleteDays: escalation.deleteDays || 0,
          repeatTriggered: Boolean(escalation.repeatTriggered)
        }
      });

      return modCase;
    }

    return null;
  } catch (err) {
    console.error('Escalation error:', err);
    return null;
  }
}

module.exports = {
  handleEscalation,
  getNextEscalationPreview,
  getRepeatReasonInfo
};