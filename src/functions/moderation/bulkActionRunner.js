// functions/moderation/bulkActionRunner.js

const { MessageFlags } = require('discord.js');

const { createCase } = require('../../logging/cases/caseStore');
const { addWarning } = require('../../logging/warnings/warningStore');
const { handleEscalation, getRepeatReasonInfo } = require('./escalationSystem');
const { checkHierarchyForBulk } = require('./moderationChecks');

const {
  parseDuration,
  isValidTimeoutDuration,
  isValidDeleteDays,
} = require('../../helpers/ui/targetHelpers');

const {
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed,
} = require('../../helpers/ui/caseComponentBuilders');

const {
  safeReply,
  safeEditReply,
} = require('../../helpers/ui/interactionResponse');

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
  const modCase = createModerationCase(interaction, member, 'warn', reason);

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
  });

  return modCase;
}

async function runBulkTimeout(interaction, member, reason, durationRaw, durationMs) {
  await member.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);

  const modCase = createModerationCase(interaction, member, 'timeout', reason, {
    duration: durationRaw,
  });

  await logBulkAction(interaction, member, 'timeout', reason, modCase.caseId, {
    duration: durationRaw,
  });

  return modCase;
}

async function runBulkKick(interaction, member, reason) {
  await member.kick(`${reason} | By ${interaction.user.tag}`);

  const modCase = createModerationCase(interaction, member, 'kick', reason);

  await logBulkAction(interaction, member, 'kick', reason, modCase.caseId);

  return modCase;
}

async function runBulkBan(interaction, member, reason, deleteDays) {
  await member.ban({
    deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    reason: `${reason} | By ${interaction.user.tag}`,
  });

  const modCase = createModerationCase(interaction, member, 'ban', reason, {
    deleteDays,
  });

  await logBulkAction(interaction, member, 'ban', reason, modCase.caseId, {
    deleteDays,
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