// functions/moderation/modActionExecutor.js

const {
  createCase,
  getCaseById,
  updateCaseStatus,
} = require('../../logging/cases/caseStore');

const { deleteWarningByCaseId } = require('../../logging/warnings/warningStore');

const {
  getPendingAction,
  deletePendingAction,
} = require('../../logging/stores/pendingActionStore');

const { fetchTarget } = require('../../helpers/ui/targetHelpers');
const { normalizeDashboardContext } = require('../../helpers/ui/pendingActionHelpers');

const { checkHierarchy } = require('./moderationChecks');
const { refreshDashboard } = require('./dashboardService');

const {
  safeReply,
  ephemeralError,
} = require('../../helpers/ui/interactionResponse');

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function clearPending(interaction, token) {
  deletePendingAction(interaction.guild.id, token);
}

async function replyActionComplete(interaction, content) {
  return interaction.update({
    content,
    embeds: [],
    components: [],
  });
}

function createModCase(interaction, pending, action, reason, metadata = {}) {
  return createCase({
    guildId: interaction.guild.id,
    userId: pending.targetId,
    moderatorId: interaction.user.id,
    action,
    reason,
    metadata,
  });
}

async function executeBan(interaction, pending, target) {
  const deleteDays = Number(pending.payload.deleteDays || 0);
  const reason = pending.payload.reason || 'No reason provided';

  await target.ban({
    deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    reason: `${reason} | By ${interaction.user.tag}`,
  });

  const modCase = createModCase(interaction, pending, 'ban', reason, {
    deleteDays,
  });

  await logAction(interaction, target, 'Ban', reason, modCase.caseId, {
    deleteDays,
  });

  return {
    target,
    content: `✅ Banned **${target.user.tag}** • Case #${modCase.caseId}`,
  };
}

async function executeKick(interaction, pending, target) {
  const reason = pending.payload.reason || 'No reason provided';

  await target.kick(`${reason} | By ${interaction.user.tag}`);

  const modCase = createModCase(interaction, pending, 'kick', reason);

  await logAction(interaction, target, 'Kick', reason, modCase.caseId);

  return {
    target,
    content: `✅ Kicked **${target.user.tag}** • Case #${modCase.caseId}`,
  };
}

async function executeRemoveWarning(interaction, pending, fallbackTarget) {
  const caseId = Number(pending.payload.caseId);

  const removed = deleteWarningByCaseId(interaction.guild.id, caseId);

  if (!removed) {
    return {
      error: 'Failed to remove warning.',
    };
  }

  const sourceCase = getCaseById(interaction.guild.id, caseId);

  if (sourceCase) {
    updateCaseStatus(interaction.guild.id, caseId, 'reversed');
  }

  const userId = sourceCase?.userId || pending.targetId;

  const unwindCase = createCase({
    guildId: interaction.guild.id,
    userId,
    moderatorId: interaction.user.id,
    action: 'unwarn',
    reason: `Removed warning from case #${caseId}`,
    relatedCaseId: caseId,
    status: 'reversed',
  });

  const logTarget =
    fallbackTarget || (await fetchTarget(interaction.guild, userId));

  if (logTarget) {
    await logAction(
      interaction,
      logTarget,
      'Unwarn',
      `Removed warning from case #${caseId}`,
      unwindCase.caseId
    );
  }

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

  const modCase = createCase({
    guildId: interaction.guild.id,
    userId: target.id,
    moderatorId: interaction.user.id,
    action: 'remove-timeout',
    reason,
    relatedCaseId: reversedSourceCaseId,
    status: 'reversed',
  });

  await logAction(
    interaction,
    target,
    'Remove Timeout',
    modCase.reason,
    modCase.caseId
  );

  return {
    target,
    content: `✅ Removed timeout from **${target.user.tag}** • Case #${modCase.caseId}`,
  };
}

async function executePendingAction(discord, interaction, token, returnContext = {}) {
  const safeReturnContext = normalizeDashboardContext(returnContext);
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
    clearPending(interaction, token);

    return safeReply(
      interaction,
      ephemeralError(cleanError(hierarchyError))
    );
  }

  const handlers = {
    ban: executeBan,
    kick: executeKick,
    'remove-warning': executeRemoveWarning,
    'remove-timeout': executeRemoveTimeout,
  };

  const handler = handlers[pending.type];

  if (!handler) {
    clearPending(interaction, token);

    return safeReply(
      interaction,
      ephemeralError('Unknown pending action type.')
    );
  }

  try {
    const result = await handler(interaction, pending, target);

    if (result?.error) {
      clearPending(interaction, token);
      return safeReply(interaction, ephemeralError(result.error));
    }

    clearPending(interaction, token);

    await replyActionComplete(interaction, result.content);

    if (result.target) {
      await refreshDashboard(
        discord,
        interaction,
        result.target,
        safeReturnContext
      );
    }

    return true;
  } catch (error) {
    console.error('❌ Pending action execution error:', error);

    clearPending(interaction, token);

    return safeReply(
      interaction,
      ephemeralError('Failed to complete that action.')
    );
  }
}

module.exports = {
  executePendingAction,
};