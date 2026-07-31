'use strict';

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  addWarning,
  getWarningById,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings,
} = require('../../../core/logging/warnings/warningStore');
const {
  createCase,
  updateCaseStatus,
} = require('../../../core/logging/cases/caseStore');
const { sendModLog } = require('../../../core/logging/modlogs/moderationActionLog');
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

function isValidWarningExpiry(value) {
  const raw = String(value || 'never').trim().toLowerCase();
  return raw === 'never' || raw === 'none' || Boolean(parseWarningExpiry(raw));
}

function buildWarnModal(targetId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_warn:${targetId}`)
    .setTitle('Warn User')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('warn_expiry')
          .setLabel('Warn expiry (7d, 2w, 1m, or never)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('never')
          .setRequired(false)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter the moderation reason')
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

async function syncExpiredWarningsToCases(guildId) {
  const expiredWarnings = purgeExpiredWarnings(guildId) || [];

  for (const warning of expiredWarnings) {
    if (warning?.caseId) updateCaseStatus(guildId, warning.caseId, 'expired');
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
  return addWarning({ guildId, userId, moderatorId, reason, caseId, expiresAt });
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

async function applyWarning(interaction, target, { reason, expiryRaw = 'never' } = {}) {
  const cleanReason = String(reason || '').trim();
  const rawExpiry = String(expiryRaw || 'never').trim().toLowerCase();

  if (!cleanReason) return { ok: false, error: 'A warning reason is required.' };
  if (!isValidWarningExpiry(rawExpiry)) {
    return { ok: false, error: 'Invalid warning expiry. Use `7d`, `2w`, `1m`, or `never`.' };
  }

  const expiresAt = parseWarningExpiry(rawExpiry);
  const modCase = createCase({
    guildId: interaction.guild.id,
    userId: target.id,
    moderatorId: interaction.user.id,
    action: 'warn',
    reason: cleanReason,
    metadata: { expiresAt },
  });

  createWarning({
    guildId: interaction.guild.id,
    userId: target.id,
    moderatorId: interaction.user.id,
    reason: cleanReason,
    caseId: modCase.caseId,
    expiresAt,
  });

  const warningContext = await getWarningContext({
    guildId: interaction.guild.id,
    userId: target.id,
    reason: cleanReason,
  });

  const escalatedCase = await runWarningEscalation({
    guild: interaction.guild,
    member: target,
    moderator: interaction.user,
    reason: cleanReason,
  });

  await sendModLog({
    guild: interaction.guild,
    target,
    moderator: interaction.user,
    action: 'Warn',
    reason: cleanReason,
    caseId: modCase.caseId,
    metadata: {
      expiresAt,
      repeatPattern: Boolean(warningContext.repeatInfo.isRepeatPattern),
      repeatCount: warningContext.repeatInfo.repeatCount || 0,
      escalatedAction: escalatedCase?.action || null,
      escalatedCaseId: escalatedCase?.caseId || null,
    },
  });

  const extraLines = [];
  if (warningContext.repeatInfo.isRepeatPattern) {
    extraLines.push(`🔁 Repeat reason detected (${warningContext.repeatInfo.repeatCount} matching warnings)`);
  }
  if (escalatedCase) {
    extraLines.push(`⚡ Auto escalation triggered: **${escalatedCase.action}** (Case #${escalatedCase.caseId})`);
  }

  return {
    ok: true,
    modCase,
    warningContext,
    escalatedCase,
    expiresAt,
    content: [
      `⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`,
      ...extraLines,
    ].join('\n'),
  };
}

module.exports = {
  parseWarningExpiry,
  isValidWarningExpiry,
  buildWarnModal,
  syncExpiredWarningsToCases,
  createWarning,
  removeWarningByCaseId,
  getWarningContext,
  runWarningEscalation,
  applyWarning,
  getWarningById,
  getWarningsForUser,
  getWarningCountForUser,
  getWarningByCaseId,
  purgeExpiredWarnings,
};
