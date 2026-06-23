const { createCase } = require('../../../logging/cases/caseStore');
const { addWarning } = require('../../../logging/warnings/warningStore');
const { handleEscalation, getRepeatReasonInfo } = require('./escalationSystem');
const { checkHierarchyForBulk } = require('./moderationChecks');

const {
  parseDuration,
  isValidTimeoutDuration,
  isValidDeleteDays,
} = require('../../../helpers/ui/targetHelpers');

const {
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed,
} = require('../../../helpers/ui/caseComponentBuilders');

const {
  safeReply,
  safeEditReply,
} = require('../../../helpers/ui/interactionResponse');

const { applyPunishmentEngine } = require('../../automod/functions/punishmentEngine');

// If this path is different in your project, only change this line.
const { sendModLog } = require('../../../logging/modlogs/moderationActionLog');

const ACTION_LABELS = {
  warn: 'Bulk Warn',
  timeout: 'Bulk Timeout',
  kick: 'Bulk Kick',
  ban: 'Bulk Ban',
};

const ACTION_EMOJIS = {
  warn: '⚠️',
  timeout: '⏳',
  kick: '👢',
  ban: '🔨',
};

const VALID_BULK_ACTIONS = Object.keys(ACTION_LABELS);
const PROGRESS_UPDATE_EVERY = 2;

function normalizeBulkIds(ids = []) {
  return [
    ...new Set(
      ids
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
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

    if (!durationMs) {
      errors.push('❌ Invalid duration. Use `10m`, `1h`, or `1d`.');
    } else if (!isValidTimeoutDuration(durationMs)) {
      errors.push('❌ Timeout cannot exceed 28 days.');
    }
  }

  if (actionType === 'ban' && !isValidDeleteDays(options.deleteDays)) {
    errors.push('❌ Delete message days must be between 0 and 7.');
  }

  return errors;
}

function createModerationCase(interaction, member, action, reason, metadata = {}) {
  return createCase({
    guildId: interaction.guild.id,
    userId: member.id,
    moderatorId: interaction.user.id,
    action,
    reason,
    metadata,
  });
}

async function logBulkAction(interaction, member, actionType, reason, caseId, metadata = {}) {
  if (typeof sendModLog !== 'function') return null;

  return sendModLog({
    guild: interaction.guild,
    target: member,
    moderator: interaction.user,
    action: ACTION_LABELS[actionType] || 'Bulk Moderation',
    reason,
    caseId,
    metadata,
  });
}

async function runBulkWarn(interaction, member, reason) {
  const report = await applyPunishmentEngine(
    {
      member,
      user: member.user,
      guild: interaction.guild,
    },
    {
      punishments: ['dm'],
      rule: 'Warning',
      reason,
      moderator: interaction.user,
      source: 'moderation',
    }
  );

  const modCase = createModerationCase(interaction, member, 'warn', reason, {
    punishmentReport: report,
  });

  addWarning({
    guildId: interaction.guild.id,
    userId: member.id,
    moderatorId: interaction.user.id,
    reason,
    caseId: modCase.caseId,
  });

  let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };
  let escalatedCase = null;

  try {
    repeatInfo = getRepeatReasonInfo({
      guildId: interaction.guild.id,
      userId: member.id,
      reason,
    }) || repeatInfo;
  } catch (error) {
    console.error('❌ Bulk warn repeat reason check failed:', error);
  }

  try {
    escalatedCase = await handleEscalation({
      guild: interaction.guild,
      member,
      moderator: interaction.user,
      reason,
    });
  } catch (error) {
    console.error('❌ Bulk warn escalation failed:', error);
  }

  await logBulkAction(interaction, member, 'warn', reason, modCase.caseId, {
    repeatPattern: Boolean(repeatInfo.isRepeatPattern),
    repeatCount: repeatInfo.repeatCount || 0,
    escalatedAction: escalatedCase?.action || null,
    escalatedCaseId: escalatedCase?.caseId || null,
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return modCase;
}

async function runBulkTimeout(interaction, member, reason, durationRaw, durationMs) {
  const report = await applyPunishmentEngine(
    {
      member,
      user: member.user,
      guild: interaction.guild,
    },
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

  const modCase = createModerationCase(interaction, member, 'timeout', reason, {
    duration: durationRaw,
    punishmentReport: report,
  });

  await logBulkAction(interaction, member, 'timeout', reason, modCase.caseId, {
    duration: durationRaw,
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return modCase;
}

async function runBulkKick(interaction, member, reason) {
  const report = await applyPunishmentEngine(
    {
      member,
      user: member.user,
      guild: interaction.guild,
    },
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

  const modCase = createModerationCase(interaction, member, 'kick', reason, {
    punishmentReport: report,
  });

  await logBulkAction(interaction, member, 'kick', reason, modCase.caseId, {
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return modCase;
}

async function runBulkBan(interaction, member, reason, deleteDays) {
  const report = await applyPunishmentEngine(
    {
      member,
      user: member.user,
      guild: interaction.guild,
    },
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

  const modCase = createModerationCase(interaction, member, 'ban', reason, {
    deleteDays,
    punishmentReport: report,
  });

  await logBulkAction(interaction, member, 'ban', reason, modCase.caseId, {
    deleteDays,
    dmSent: report.dmSent,
    punishmentReport: report,
  });

  return modCase;
}

async function runSingleBulkAction(interaction, member, options) {
  const {
    actionType,
    reason,
    durationRaw = null,
    durationMs = null,
    deleteDays = 0,
  } = options;

  if (actionType === 'warn') {
    return runBulkWarn(interaction, member, reason);
  }

  if (actionType === 'timeout') {
    return runBulkTimeout(interaction, member, reason, durationRaw, durationMs);
  }

  if (actionType === 'kick') {
    return runBulkKick(interaction, member, reason);
  }

  if (actionType === 'ban') {
    return runBulkBan(interaction, member, reason, deleteDays);
  }

  throw new Error('Unknown action.');
}

async function updateBulkProgress(interaction, actionLabel, total, processed, success, failed) {
  return safeEditReply(interaction, {
    embeds: [
      getBulkActionProgressEmbed({
        actionLabel,
        total,
        processed,
        successCount: success.length,
        failCount: failed.length,
      }),
    ],
  });
}

async function runBulkAction(interaction, options) {
  const {
    actionType,
    ids,
    reason,
    durationRaw = null,
    deleteDays = 0,
  } = options;

  const uniqueIds = normalizeBulkIds(ids);
  const actionLabel = ACTION_LABELS[actionType] || 'Bulk Moderation';

  const validationErrors = validateBulkOptions(actionType, {
    ids: uniqueIds,
    reason,
    durationRaw,
    deleteDays,
  });

  if (validationErrors.length) {
    return safeReply(interaction, {
      content: validationErrors.join('\n'),
      flags: 64,
    });
  }

  const durationMs = actionType === 'timeout'
    ? parseDuration(durationRaw)
    : null;

  const total = uniqueIds.length;
  const success = [];
  const failed = [];

  await safeReply(interaction, {
    embeds: [
      getBulkActionProgressEmbed({
        actionLabel,
        total,
        processed: 0,
        successCount: 0,
        failCount: 0,
      }),
    ],
    flags: 64,
  });

  const actorMember = interaction.member;
  const botMember = interaction.guild.members.me;

  for (let index = 0; index < uniqueIds.length; index += 1) {
    const id = uniqueIds[index];

    try {
      const member = await interaction.guild.members.fetch(id);

      const hierarchyError = checkHierarchyForBulk(
        actorMember,
        botMember,
        interaction.guild.ownerId,
        member,
        interaction.user.id
      );

      if (hierarchyError) {
        failed.push(`❌ ${id} — ${hierarchyError}`);
      } else {
        await runSingleBulkAction(interaction, member, {
          actionType,
          reason,
          durationRaw,
          durationMs,
          deleteDays,
        });

        success.push(`${ACTION_EMOJIS[actionType] || '✅'} ${member.user.tag}`);
      }
    } catch (error) {
      failed.push(`❌ ${id} — ${error?.message || 'Failed to process.'}`);
    }

    const processed = index + 1;
    const shouldUpdate =
      processed % PROGRESS_UPDATE_EVERY === 0 || processed === total;

    if (shouldUpdate) {
      await updateBulkProgress(
        interaction,
        actionLabel,
        total,
        processed,
        success,
        failed
      );
    }
  }

  return safeEditReply(interaction, {
    embeds: [
      getBulkActionSummaryEmbed({
        actionLabel,
        total,
        success,
        failed,
      }),
    ],
  });
}

module.exports = {
  ACTION_LABELS,
  ACTION_EMOJIS,
  VALID_BULK_ACTIONS,

  normalizeBulkIds,
  validateBulkOptions,

  runBulkAction,
};
