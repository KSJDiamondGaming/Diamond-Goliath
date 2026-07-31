'use strict';

const crypto = require('crypto');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const db = require('../../../features/moderation/functions/moderationStore');
const {
  createCase,
  getCaseById,
  updateCaseStatus,
} = require('../../../core/logging/cases/caseStore');
const { applyPunishmentEngine } = require('../../../core/automod/punishmentEngine');
const { sendModLog } = require('../../../core/logging/modlogs/moderationActionLog');
const {
  safeReply,
  safeEditReply,
  ephemeralError,
} = require('../../../core/ui/interactionResponse');
const {
  checkHierarchy,
  checkHierarchyForBulk,
} = require('./permissions');
const {
  createWarning,
  removeWarningByCaseId,
  getWarningContext,
  runWarningEscalation,
} = require('./warns');
const {
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed,
} = require('./cases');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DURATION_UNITS = Object.freeze({
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
});
const ACTION_LABELS = Object.freeze({
  warn: 'Bulk Warn',
  timeout: 'Bulk Timeout',
  kick: 'Bulk Kick',
  ban: 'Bulk Ban',
});
const ACTION_EMOJIS = Object.freeze({
  warn: '⚠️',
  timeout: '⏳',
  kick: '👢',
  ban: '🔨',
});
const VALID_BULK_ACTIONS = Object.keys(ACTION_LABELS);
const PROGRESS_UPDATE_EVERY = 2;

function parseDuration(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/);
  if (!match) return null;

  const durationMs = Math.floor(Number(match[1]) * DURATION_UNITS[match[2]]);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

function isValidTimeoutDuration(durationMs) {
  const value = Number(durationMs);
  return Number.isFinite(value) && value > 0 && value <= MAX_TIMEOUT_MS;
}

function isValidDeleteDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 7;
}

function parseDeleteDays(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const days = Number(raw);
  return isValidDeleteDays(days) ? days : null;
}

async function fetchTarget(guild, userId) {
  const id = String(userId || '').trim();
  if (!guild || !/^\d{16,20}$/.test(id)) return null;
  return guild.members.fetch(id).catch(() => guild.members.cache.get(id) || null);
}

function buildPunishmentModal(type, targetId) {
  const config = {
    timeout: { title: 'Timeout User', duration: true },
    kick: { title: 'Kick User' },
    ban: { title: 'Ban User', days: true },
  }[type];
  if (!config) return null;

  const modal = new ModalBuilder()
    .setCustomId(`mod_submit_${type}:${targetId}`)
    .setTitle(config.title);
  const rows = [];

  if (config.days) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('days')
        .setLabel('Delete message days (0-7)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('0')
        .setRequired(true)
        .setMaxLength(1)
    ));
  }

  if (config.duration) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration (10m, 1h, 1d)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1h')
        .setRequired(true)
        .setMaxLength(10)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the moderation reason')
      .setRequired(true)
      .setMaxLength(500)
  ));

  return modal.addComponents(...rows);
}

function buildBulkModal(type) {
  const modal = new ModalBuilder()
    .setCustomId(`mod_submit_bulk_${type}`)
    .setTitle(ACTION_LABELS[type] || 'Bulk Moderation');
  const rows = [new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('users')
      .setLabel('User IDs (comma separated)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('123456789012345678, 987654321098765432')
      .setRequired(true)
  )];

  if (type === 'timeout') {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration (10m, 1h, 1d)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1h')
        .setRequired(true)
    ));
  }

  if (type === 'ban') {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('days')
        .setLabel('Delete message days (0-7)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('0')
        .setRequired(true)
        .setMaxLength(1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the moderation reason')
      .setRequired(true)
      .setMaxLength(500)
  ));

  return modal.addComponents(...rows);
}

function purgeExpiredPendingActions(guildId) {
  db.prepare('DELETE FROM pending_actions WHERE guild_id = ? AND expires_at <= ?')
    .run(guildId, new Date().toISOString());
}

function createPendingAction(guildId, action = {}) {
  purgeExpiredPendingActions(guildId);
  const token = crypto.randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();

  db.prepare(`
    INSERT INTO pending_actions (
      token, guild_id, moderator_id, target_id, type, payload, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token,
    guildId,
    action.moderatorId || null,
    action.targetId || null,
    action.type || 'unknown',
    JSON.stringify(action.payload || {}),
    createdAt,
    expiresAt
  );

  return token;
}

function getPendingAction(guildId, token) {
  purgeExpiredPendingActions(guildId);
  const row = db.prepare(
    'SELECT * FROM pending_actions WHERE guild_id = ? AND token = ?'
  ).get(guildId, token);
  if (!row) return null;

  return {
    token: row.token,
    moderatorId: row.moderator_id,
    targetId: row.target_id,
    type: row.type,
    payload: row.payload ? JSON.parse(row.payload) : {},
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function deletePendingAction(guildId, token) {
  db.prepare('DELETE FROM pending_actions WHERE guild_id = ? AND token = ?')
    .run(guildId, token);
}

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function normalizeDashboardContext(context = {}) {
  return {
    view: context.view || 'cases',
    actionFilter: context.actionFilter || 'all',
    statusFilter: context.statusFilter || 'all',
    page: Number(context.page) || 0,
  };
}

function createModerationCase(interaction, targetId, action, reason, metadata = {}, extras = {}) {
  return createCase({
    guildId: interaction.guild.id,
    userId: targetId,
    moderatorId: interaction.user.id,
    action,
    reason,
    metadata,
    ...extras,
  });
}

async function logAction(interaction, target, action, reason, caseId, metadata = {}) {
  if (typeof sendModLog !== 'function' || !target) return null;
  return sendModLog({
    guild: interaction.guild,
    target,
    moderator: interaction.user,
    action,
    reason,
    caseId,
    metadata,
  });
}

async function submitTimeout(interaction, target) {
  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const durationMs = parseDuration(durationRaw);

  if (!durationMs) {
    await safeReply(interaction, ephemeralError('Invalid duration. Use `10m`, `1h`, or `1d`.'));
    return { ok: false, target };
  }
  if (!isValidTimeoutDuration(durationMs)) {
    await safeReply(interaction, ephemeralError('Timeout cannot exceed 28 days.'));
    return { ok: false, target };
  }

  try {
    const report = await applyPunishmentEngine(
      { member: target, user: target.user, guild: interaction.guild },
      {
        punishments: ['dm', 'timeout'],
        rule: 'Timeout',
        reason,
        durationMs,
        moderator: interaction.user,
        source: 'moderation',
      }
    );

    if (!report.applied.includes('timeout')) {
      throw new Error(`Failed to timeout user. Failed: ${report.failedText}`);
    }

    const modCase = createModerationCase(
      interaction,
      target.id,
      'timeout',
      reason,
      { duration: durationRaw, punishmentReport: report }
    );

    await logAction(interaction, target, 'Timeout', reason, modCase.caseId, {
      duration: durationRaw,
      dmSent: report.dmSent,
      punishmentReport: report,
    });

    await safeReply(interaction, {
      content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`,
      flags: 64,
    });

    return { ok: true, target, modCase, report };
  } catch (error) {
    console.error('❌ Timeout error:', error);
    await safeReply(interaction, ephemeralError('Failed to timeout user.'));
    return { ok: false, target, error };
  }
}

async function submitPunishmentRequest(interaction, target, action, createConfirmation) {
  if (!target || !['timeout', 'kick', 'ban'].includes(action)) return false;

  if (action === 'timeout') {
    return submitTimeout(interaction, target);
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (action === 'ban') {
    const deleteDays = parseDeleteDays(interaction.fields.getTextInputValue('days'));
    if (deleteDays === null) {
      await safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
      return { ok: false, target };
    }

    await createConfirmation(
      interaction,
      target.id,
      'ban',
      { reason, deleteDays },
      `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`
    );
    return { ok: true, pending: true, target };
  }

  await createConfirmation(
    interaction,
    target.id,
    'kick',
    { reason },
    `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`
  );
  return { ok: true, pending: true, target };
}

function parseBulkModalPayload(interaction, actionType) {
  const payload = {
    actionType,
    ids: interaction.fields.getTextInputValue('users').split(','),
    reason: interaction.fields.getTextInputValue('reason'),
  };

  if (actionType === 'timeout') {
    payload.durationRaw = interaction.fields.getTextInputValue('duration');
  }

  if (actionType === 'ban') {
    payload.deleteDays = parseDeleteDays(interaction.fields.getTextInputValue('days'));
    if (payload.deleteDays === null) {
      return { error: 'Delete message days must be 0-7.' };
    }
  }

  return { payload };
}

async function submitBulkModal(interaction, actionType) {
  const parsed = parseBulkModalPayload(interaction, actionType);
  if (parsed.error) {
    return safeReply(interaction, ephemeralError(parsed.error));
  }
  return runBulkAction(interaction, parsed.payload);
}

async function executeBan(interaction, pending, target) {
  const deleteDays = Number(pending.payload.deleteDays || 0);
  const reason = pending.payload.reason || 'No reason provided';
  const report = await applyPunishmentEngine(
    { member: target, user: target.user, guild: interaction.guild },
    {
      punishments: ['dm', 'ban'],
      rule: 'Ban',
      reason,
      deleteDays,
      moderator: interaction.user,
      source: 'moderation',
    }
  );

  if (!report.applied.includes('ban')) {
    return {
      error: `Failed to ban user. ${report.failedText !== 'none' ? `Failed: ${report.failedText}` : ''}`.trim(),
    };
  }

  const modCase = createModerationCase(
    interaction,
    target.id,
    'ban',
    reason,
    { deleteDays, punishmentReport: report }
  );
  await logAction(interaction, target, 'Ban', reason, modCase.caseId, {
    deleteDays,
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return {
    target,
    content: `✅ Banned **${target.user.tag}** • Case #${modCase.caseId}${report.dmSent ? ' • DM sent ✅' : ' • DM failed ❌'}`,
  };
}

async function executeKick(interaction, pending, target) {
  const reason = pending.payload.reason || 'No reason provided';
  const report = await applyPunishmentEngine(
    { member: target, user: target.user, guild: interaction.guild },
    {
      punishments: ['dm', 'kick'],
      rule: 'Kick',
      reason,
      moderator: interaction.user,
      source: 'moderation',
    }
  );

  if (!report.applied.includes('kick')) {
    return {
      error: `Failed to kick user. ${report.failedText !== 'none' ? `Failed: ${report.failedText}` : ''}`.trim(),
    };
  }

  const modCase = createModerationCase(
    interaction,
    target.id,
    'kick',
    reason,
    { punishmentReport: report }
  );
  await logAction(interaction, target, 'Kick', reason, modCase.caseId, {
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return {
    target,
    content: `✅ Kicked **${target.user.tag}** • Case #${modCase.caseId}${report.dmSent ? ' • DM sent ✅' : ' • DM failed ❌'}`,
  };
}

async function executeRemoveWarning(interaction, pending, fallbackTarget) {
  const caseId = Number(pending.payload.caseId);
  const warning = removeWarningByCaseId(interaction.guild.id, caseId);
  if (!warning) return { error: 'Failed to remove warning.' };

  const sourceCase = getCaseById(interaction.guild.id, caseId);
  const userId = sourceCase?.userId || warning.userId || pending.targetId;
  const unwindCase = createModerationCase(
    interaction,
    userId,
    'unwarn',
    `Removed warning from case #${caseId}`,
    {},
    { relatedCaseId: caseId, status: 'reversed' }
  );

  const logTarget = fallbackTarget || await fetchTarget(interaction.guild, userId);
  await logAction(interaction, logTarget, 'Unwarn', unwindCase.reason, unwindCase.caseId);
  return {
    target: logTarget,
    content: `🗑️ Removed warning linked to **Case #${caseId}**.`,
  };
}

async function executeRemoveTimeout(interaction, pending, target) {
  await target.timeout(null, `Timeout removed by ${interaction.user.tag}`);
  const reversedSourceCaseId = pending.payload.sourceCaseId || null;
  if (reversedSourceCaseId) {
    updateCaseStatus(interaction.guild.id, reversedSourceCaseId, 'reversed');
  }

  const reason = reversedSourceCaseId
    ? `Removed timeout from case #${reversedSourceCaseId}`
    : 'Timeout removed from panel';
  const modCase = createModerationCase(
    interaction,
    target.id,
    'remove-timeout',
    reason,
    {},
    { relatedCaseId: reversedSourceCaseId, status: 'reversed' }
  );
  await logAction(interaction, target, 'Remove Timeout', reason, modCase.caseId);

  return {
    target,
    content: `✅ Removed timeout from **${target.user.tag}** • Case #${modCase.caseId}`,
  };
}

async function executePendingAction(discord, interaction, token, returnContext = {}) {
  const pending = getPendingAction(interaction.guild.id, token);
  if (!pending) {
    return safeReply(
      interaction,
      ephemeralError('That pending action has expired or could not be found.')
    );
  }
  if (pending.moderatorId !== interaction.user.id) {
    return safeReply(
      interaction,
      ephemeralError('Only the moderator who created this action can confirm it.')
    );
  }

  const target = await fetchTarget(interaction.guild, pending.targetId);
  const hierarchyError = checkHierarchy(interaction, target);
  if (hierarchyError && pending.type !== 'remove-warning') {
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError(cleanError(hierarchyError)));
  }

  const handlers = {
    ban: executeBan,
    kick: executeKick,
    'remove-warning': executeRemoveWarning,
    'remove-timeout': executeRemoveTimeout,
  };
  const handler = handlers[pending.type];
  if (!handler) {
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError('Unknown pending action type.'));
  }

  try {
    const result = await handler(interaction, pending, target);
    deletePendingAction(interaction.guild.id, token);
    if (result?.error) return safeReply(interaction, ephemeralError(result.error));

    await interaction.update({
      content: result.content,
      embeds: [],
      components: [],
    });

    if (result.target) {
      const { refreshDashboard } = require('./modPanel');
      if (typeof refreshDashboard === 'function') {
        await refreshDashboard(
          discord,
          interaction,
          result.target,
          normalizeDashboardContext(returnContext)
        );
      }
    }
    return true;
  } catch (error) {
    console.error('❌ Pending action execution error:', error);
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError('Failed to complete that action.'));
  }
}

function normalizeBulkIds(ids = []) {
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

function validateBulkOptions(actionType, options = {}) {
  const errors = [];
  if (!VALID_BULK_ACTIONS.includes(actionType)) {
    errors.push('❌ Unknown bulk action type.');
  }
  if (!Array.isArray(options.ids) || !options.ids.length) {
    errors.push('❌ No valid user IDs provided.');
  }
  if (!String(options.reason || '').trim()) {
    errors.push('❌ A reason is required.');
  }

  if (actionType === 'timeout') {
    const durationMs = parseDuration(options.durationRaw);
    if (!durationMs) errors.push('❌ Invalid duration. Use `10m`, `1h`, or `1d`.');
    else if (!isValidTimeoutDuration(durationMs)) {
      errors.push('❌ Timeout cannot exceed 28 days.');
    }
  }

  if (actionType === 'ban' && !isValidDeleteDays(options.deleteDays)) {
    errors.push('❌ Delete message days must be between 0 and 7.');
  }

  return errors;
}

async function runBulkWarn(interaction, member, reason) {
  const report = await applyPunishmentEngine(
    { member, user: member.user, guild: interaction.guild },
    {
      punishments: ['dm'],
      rule: 'Warning',
      reason,
      moderator: interaction.user,
      source: 'moderation',
    }
  );
  const modCase = createModerationCase(
    interaction,
    member.id,
    'warn',
    reason,
    { punishmentReport: report }
  );
  createWarning({
    guildId: interaction.guild.id,
    userId: member.id,
    moderatorId: interaction.user.id,
    reason,
    caseId: modCase.caseId,
  });

  const warningContext = await getWarningContext({
    guildId: interaction.guild.id,
    userId: member.id,
    reason,
  });
  const escalatedCase = await runWarningEscalation({
    guild: interaction.guild,
    member,
    moderator: interaction.user,
    reason,
  });

  await logAction(interaction, member, 'Bulk Warn', reason, modCase.caseId, {
    repeatPattern: Boolean(warningContext.repeatInfo.isRepeatPattern),
    repeatCount: warningContext.repeatInfo.repeatCount || 0,
    escalatedAction: escalatedCase?.action || null,
    escalatedCaseId: escalatedCase?.caseId || null,
    dmSent: report.dmSent,
    punishmentReport: report,
  });
  return modCase;
}

async function runBulkTimeout(interaction, member, reason, durationRaw, durationMs) {
  const report = await applyPunishmentEngine(
    { member, user: member.user, guild: interaction.guild },
    {
      punishments: ['dm', 'timeout'],
      rule: 'Timeout',
      reason,
      durationMs,
      moderator: interaction.user,
      source: 'moderation',
    }
  );
  if (!report.applied.includes('timeout')) {
    throw new Error(`Failed to timeout user. Failed: ${report.failedText}`);
  }

  const modCase = createModerationCase(
    interaction,
    member.id,
    'timeout',
    reason,
    { duration: durationRaw, punishmentReport: report }
  );
  await logAction(interaction, member, 'Bulk Timeout', reason, modCase.caseId, {
    duration: durationRaw,
    dmSent: report.dmSent,
    punishmentReport: report,
  });
  return modCase;
}

async function runBulkKick(interaction, member, reason) {
  const report = await applyPunishmentEngine(
    { member, user: member.user, guild: interaction.guild },
    {
      punishments: ['dm', 'kick'],
      rule: 'Kick',
      reason,
      moderator: interaction.user,
      source: 'moderation',
    }
  );
  if (!report.applied.includes('kick')) {
    throw new Error(`Failed to kick user. Failed: ${report.failedText}`);
  }

  const modCase = createModerationCase(
    interaction,
    member.id,
    'kick',
    reason,
    { punishmentReport: report }
  );
  await logAction(interaction, member, 'Bulk Kick', reason, modCase.caseId, {
    dmSent: report.dmSent,
    punishmentReport: report,
  });
  return modCase;
}

async function runBulkBan(interaction, member, reason, deleteDays) {
  const report = await applyPunishmentEngine(
    { member, user: member.user, guild: interaction.guild },
    {
      punishments: ['dm', 'ban'],
      rule: 'Ban',
      reason,
      deleteDays,
      moderator: interaction.user,
      source: 'moderation',
    }
  );
  if (!report.applied.includes('ban')) {
    throw new Error(`Failed to ban user. Failed: ${report.failedText}`);
  }

  const modCase = createModerationCase(
    interaction,
    member.id,
    'ban',
    reason,
    { deleteDays, punishmentReport: report }
  );
  await logAction(interaction, member, 'Bulk Ban', reason, modCase.caseId, {
    deleteDays,
    dmSent: report.dmSent,
    punishmentReport: report,
  });
  return modCase;
}

async function runSingleBulkAction(interaction, member, options) {
  if (options.actionType === 'warn') {
    return runBulkWarn(interaction, member, options.reason);
  }
  if (options.actionType === 'timeout') {
    return runBulkTimeout(
      interaction,
      member,
      options.reason,
      options.durationRaw,
      options.durationMs
    );
  }
  if (options.actionType === 'kick') {
    return runBulkKick(interaction, member, options.reason);
  }
  if (options.actionType === 'ban') {
    return runBulkBan(interaction, member, options.reason, options.deleteDays);
  }
  throw new Error('Unknown action.');
}

async function runBulkAction(interaction, options) {
  const uniqueIds = normalizeBulkIds(options.ids);
  const actionLabel = ACTION_LABELS[options.actionType] || 'Bulk Moderation';
  const validationErrors = validateBulkOptions(
    options.actionType,
    { ...options, ids: uniqueIds }
  );
  if (validationErrors.length) {
    return safeReply(interaction, {
      content: validationErrors.join('\n'),
      flags: 64,
    });
  }

  const durationMs = options.actionType === 'timeout'
    ? parseDuration(options.durationRaw)
    : null;
  const total = uniqueIds.length;
  const success = [];
  const failed = [];

  await safeReply(interaction, {
    embeds: [getBulkActionProgressEmbed({
      actionLabel,
      total,
      processed: 0,
      successCount: 0,
      failCount: 0,
    })],
    flags: 64,
  });

  for (let index = 0; index < uniqueIds.length; index += 1) {
    const id = uniqueIds[index];
    try {
      const member = await interaction.guild.members.fetch(id);
      const hierarchyError = checkHierarchyForBulk(
        interaction.member,
        interaction.guild.members.me,
        interaction.guild.ownerId,
        member,
        interaction.user.id
      );

      if (hierarchyError) {
        failed.push(`❌ ${id} — ${hierarchyError}`);
      } else {
        await runSingleBulkAction(
          interaction,
          member,
          { ...options, durationMs }
        );
        success.push(`${ACTION_EMOJIS[options.actionType] || '✅'} ${member.user.tag}`);
      }
    } catch (error) {
      failed.push(`❌ ${id} — ${error?.message || 'Failed to process.'}`);
    }

    const processed = index + 1;
    if (processed % PROGRESS_UPDATE_EVERY === 0 || processed === total) {
      await safeEditReply(interaction, {
        embeds: [getBulkActionProgressEmbed({
          actionLabel,
          total,
          processed,
          successCount: success.length,
          failCount: failed.length,
        })],
      });
    }
  }

  return safeEditReply(interaction, {
    embeds: [getBulkActionSummaryEmbed({ actionLabel, total, success, failed })],
  });
}

module.exports = {
  MAX_TIMEOUT_MS,
  ACTION_LABELS,
  ACTION_EMOJIS,
  VALID_BULK_ACTIONS,
  parseDuration,
  isValidTimeoutDuration,
  parseDeleteDays,
  isValidDeleteDays,
  fetchTarget,
  buildPunishmentModal,
  buildBulkModal,
  submitTimeout,
  submitPunishmentRequest,
  parseBulkModalPayload,
  submitBulkModal,
  createPendingAction,
  getPendingAction,
  deletePendingAction,
  executePendingAction,
  normalizeBulkIds,
  validateBulkOptions,
  runBulkAction,
};
