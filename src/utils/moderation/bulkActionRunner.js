const { MessageFlags } = require('discord.js');

const { createCase } = require('../../core/modules/moderation/cases');
const { addWarning } = require('../logging/modlogs/warningStore');
const { sendModLog } = require('../logging/modlogs/modLog');

const { handleEscalation, getRepeatReasonInfo } = require('../admin/escalationSystem');
const { checkHierarchyForBulk } = require('../admin/hierarchyChecks');
const {
  parseDuration,
  isValidTimeoutDuration,
  isValidDeleteDays
} = require('../utility/targetHelpers');
const {
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed
} = require('../utility/caseComponentBuilders');
const {
  safeReply,
  safeEditReply
} = require('../utility/interactionResponse');

// =========================
// 🏷️ Labels
// =========================
const ACTION_LABELS = {
  warn: 'Bulk Warn',
  timeout: 'Bulk Timeout',
  kick: 'Bulk Kick',
  ban: 'Bulk Ban'
};

// =========================
// 🧹 Normalize IDs
// =========================
function normalizeBulkIds(ids = []) {
  return [
    ...new Set(
      ids
        .map(id => String(id || '').trim())
        .filter(Boolean)
    )
  ];
}

// =========================
// ✅ Validation
// =========================
function validateBulkOptions(actionType, options = {}) {
  const errors = [];

  if (!['warn', 'timeout', 'kick', 'ban'].includes(actionType)) {
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

  if (actionType === 'ban') {
    if (!isValidDeleteDays(options.deleteDays)) {
      errors.push('❌ Delete message days must be between 0 and 7.');
    }
  }

  return errors;
}

// =========================
// ⚙️ Main Runner
// =========================
async function runBulkAction(interaction, options) {
  const {
    actionType,
    ids,
    reason,
    durationRaw = null,
    deleteDays = 0
  } = options;

  const uniqueIds = normalizeBulkIds(ids);
  const actionLabel = ACTION_LABELS[actionType] || 'Bulk Moderation';

  const validationErrors = validateBulkOptions(actionType, {
    ids: uniqueIds,
    reason,
    durationRaw,
    deleteDays
  });

  if (validationErrors.length) {
    return safeReply(interaction, {
      content: validationErrors.join('\n'),
      flags: MessageFlags.Ephemeral
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
        failCount: 0
      })
    ],
    flags: MessageFlags.Ephemeral
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
      } else if (actionType === 'warn') {
        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'warn',
          reason
        });

        addWarning({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          reason,
          caseId: modCase.caseId
        });

        let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };
        let escalatedCase = null;

        try {
          repeatInfo = getRepeatReasonInfo({
            guildId: interaction.guild.id,
            userId: member.id,
            reason
          }) || repeatInfo;
        } catch (error) {
          console.error('Bulk warn repeat reason check failed:', error);
        }

        try {
          escalatedCase = await handleEscalation({
            guild: interaction.guild,
            member,
            moderator: interaction.user,
            reason
          });
        } catch (error) {
          console.error('Bulk warn escalation failed:', error);
        }

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Warn',
          reason,
          caseId: modCase.caseId,
          metadata: {
            repeatPattern: Boolean(repeatInfo.isRepeatPattern),
            repeatCount: repeatInfo.repeatCount || 0,
            escalatedAction: escalatedCase?.action || null,
            escalatedCaseId: escalatedCase?.caseId || null
          }
        });

        success.push(`⚠️ ${member.user.tag}`);
      } else if (actionType === 'timeout') {
        await member.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'timeout',
          reason,
          metadata: { duration: durationRaw }
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Timeout',
          reason,
          caseId: modCase.caseId,
          metadata: { duration: durationRaw }
        });

        success.push(`⏳ ${member.user.tag}`);
      } else if (actionType === 'kick') {
        await member.kick(`${reason} | By ${interaction.user.tag}`);

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'kick',
          reason
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Kick',
          reason,
          caseId: modCase.caseId
        });

        success.push(`👢 ${member.user.tag}`);
      } else if (actionType === 'ban') {
        await member.ban({
          deleteMessageSeconds: deleteDays * 24 * 60 * 60,
          reason: `${reason} | By ${interaction.user.tag}`
        });

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'ban',
          reason,
          metadata: { deleteDays }
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Ban',
          reason,
          caseId: modCase.caseId,
          metadata: { deleteDays }
        });

        success.push(`🔨 ${member.user.tag}`);
      } else {
        failed.push(`❌ ${id} — Unknown action.`);
      }
    } catch (error) {
      failed.push(`❌ ${id} — ${error?.message || 'Failed to process.'}`);
    }

    if ((index + 1) % 2 === 0 || index === uniqueIds.length - 1) {
      await safeEditReply(interaction, {
        embeds: [
          getBulkActionProgressEmbed({
            actionLabel,
            total,
            processed: index + 1,
            successCount: success.length,
            failCount: failed.length
          })
        ]
      });
    }
  }

  return safeEditReply(interaction, {
    embeds: [
      getBulkActionSummaryEmbed({
        actionLabel,
        total,
        success,
        failed
      })
    ]
  });
}

module.exports = {
  ACTION_LABELS,
  normalizeBulkIds,
  validateBulkOptions,
  runBulkAction
};