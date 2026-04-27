const { MessageFlags } = require('discord.js');

const {
  createCase,
  getCaseById,
  updateCaseStatus
} = require('../../core/modules/moderation/cases');

const {
  deleteWarningByCaseId
} = require('../logging/modlogs/warningStore');

const {
  getPendingAction,
  deletePendingAction
} = require('../logging/modlogs/pendingActionStore');

const { sendModLog } = require('../logging/modlogs/modLog');

const { fetchTarget } = require('../utility/targetHelpers');
const { checkHierarchy } = require('../admin/hierarchyChecks');
const { refreshDashboard } = require('./dashboardService');
const { normalizeDashboardContext } = require('../utility/pendingActionHelpers');
const {
  safeReply,
  ephemeralError
} = require('../utility/interactionResponse');

// =========================
// ⚙️ Execute Pending Action
// =========================
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
  const error = checkHierarchy(interaction, target);

  if (error && pending.type !== 'remove-warning') {
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
  }

  try {
    // =========================
    // 🔨 Ban
    // =========================
    if (pending.type === 'ban') {
      await target.ban({
        deleteMessageSeconds: pending.payload.deleteDays * 24 * 60 * 60,
        reason: `${pending.payload.reason} | By ${interaction.user.tag}`
      });

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'ban',
        reason: pending.payload.reason,
        metadata: { deleteDays: pending.payload.deleteDays }
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Ban',
        reason: pending.payload.reason,
        caseId: modCase.caseId,
        metadata: { deleteDays: pending.payload.deleteDays }
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Banned **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(discord, interaction, target, safeReturnContext);
      return true;
    }

    // =========================
    // 👢 Kick
    // =========================
    if (pending.type === 'kick') {
      await target.kick(`${pending.payload.reason} | By ${interaction.user.tag}`);

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'kick',
        reason: pending.payload.reason
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Kick',
        reason: pending.payload.reason,
        caseId: modCase.caseId
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Kicked **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(discord, interaction, target, safeReturnContext);
      return true;
    }

    // =========================
    // 🗑️ Remove Warning
    // =========================
    if (pending.type === 'remove-warning') {
      const removed = deleteWarningByCaseId(
        interaction.guild.id,
        pending.payload.caseId
      );

      if (!removed) {
        deletePendingAction(interaction.guild.id, token);
        return safeReply(interaction, ephemeralError('Failed to remove warning.'));
      }

      const sourceCase = getCaseById(interaction.guild.id, pending.payload.caseId);

      if (sourceCase) {
        updateCaseStatus(interaction.guild.id, pending.payload.caseId, 'reversed');
      }

      const userId = sourceCase?.userId || pending.targetId;

      const unwindCase = createCase({
        guildId: interaction.guild.id,
        userId,
        moderatorId: interaction.user.id,
        action: 'unwarn',
        reason: `Removed warning from case #${pending.payload.caseId}`,
        relatedCaseId: pending.payload.caseId,
        status: 'reversed'
      });

      const logTarget = target || await fetchTarget(interaction.guild, userId);

      if (logTarget) {
        await sendModLog({
          guild: interaction.guild,
          target: logTarget,
          moderator: interaction.user,
          action: 'Unwarn',
          reason: `Removed warning from case #${pending.payload.caseId}`,
          caseId: unwindCase.caseId
        });
      }

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `🗑️ Removed warning linked to **Case #${pending.payload.caseId}**.`,
        embeds: [],
        components: []
      });

      if (logTarget) {
        await refreshDashboard(discord, interaction, logTarget, safeReturnContext);
      }

      return true;
    }

    // =========================
    // ✅ Remove Timeout
    // =========================
    if (pending.type === 'remove-timeout') {
      await target.timeout(null, `Timeout removed by ${interaction.user.tag}`);

      const reversedSourceCaseId = pending.payload.sourceCaseId || null;

      if (reversedSourceCaseId) {
        updateCaseStatus(interaction.guild.id, reversedSourceCaseId, 'reversed');
      }

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'remove-timeout',
        reason: reversedSourceCaseId
          ? `Removed timeout from case #${reversedSourceCaseId}`
          : 'Timeout removed from panel',
        relatedCaseId: reversedSourceCaseId,
        status: 'reversed'
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Remove Timeout',
        reason: modCase.reason,
        caseId: modCase.caseId
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Removed timeout from **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(discord, interaction, target, safeReturnContext);
      return true;
    }

    deletePendingAction(interaction.guild.id, token);

    return safeReply(
      interaction,
      ephemeralError('Unknown pending action type.')
    );
  } catch (error) {
    console.error('Pending action execution error:', error);
    deletePendingAction(interaction.guild.id, token);

    return safeReply(
      interaction,
      ephemeralError('Failed to complete that action.')
    );
  }
}

module.exports = {
  executePendingAction
};