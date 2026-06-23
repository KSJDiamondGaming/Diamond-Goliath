// functions/moderation/modModalRouter.js

const Discord = require('discord.js');
const { MessageFlags, EmbedBuilder } = require('discord.js');

const {
  hasModPermission,
  canUseModAction,
  getModActionDeniedMessage,
  checkHierarchy,
} = require('./moderationChecks');

const {
  fetchTarget,
  findMemberByQuery,
  parseDuration,
  isValidTimeoutDuration,
  getWarningExpiry,
  parseDeleteDays,
} = require('../../../helpers/ui/targetHelpers');

const {
  getStatusLabel,
  syncExpiredWarningsToCases,
} = require('./caseHelpers');

const { runBulkAction } = require('./bulkActionRunner');
const { refreshDashboard, buildDashboardPayload } = require('./dashboardService');

const {
  safeReply,
  ephemeralError,
} = require('../../../helpers/ui/interactionResponse');

const { buildCaseDetailButtons } = require('../../../helpers/ui/caseComponentBuilders');

const {
  buildConfirmRow,
  buildConfirmCustomId,
} = require('../../../helpers/ui/pendingActionHelpers');

const {
  createCase,
  getCaseById,
  updateCaseReason,
  updateCaseNote,
  clearCaseNote,
} = require('../../../core/logging/cases/caseStore');

const {
  addWarning,
  getWarningByCaseId,
} = require('../../../core/logging/warnings/warningStore');

const { createPendingAction } = require('../../../core/logging/stores/pendingActionStore');
const {
  handleEscalation,
  getRepeatReasonInfo,
} = require('./escalationSystem');

const DEFAULT_DASHBOARD_CONTEXT = {
  view: 'cases',
  actionFilter: 'all',
  statusFilter: 'all',
  page: 0,
};

function ensureModalAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(
      interaction,
      ephemeralError('No permission to use moderation panel.')
    );
  }

  return null;
}

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function getCaseIdFromModal(interaction, field = 'case_id') {
  const raw = interaction.fields.getTextInputValue(field).trim();

  if (!/^\d+$/.test(raw)) return null;

  return Number(raw);
}

function getTargetIdFromCustomId(customId) {
  const [, targetId] = customId.split(':');
  return targetId || 'none';
}

async function replyNoPermission(interaction, action) {
  return safeReply(interaction, {
    content: getModActionDeniedMessage(action),
    flags: 64,
  });
}

async function refreshCasesDashboard(interaction, target) {
  if (!target) return false;

  await refreshDashboard(
    Discord,
    interaction,
    target,
    DEFAULT_DASHBOARD_CONTEXT
  );

  return true;
}

function buildCaseDetailEmbed(modCase) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🧾 Case #${modCase.caseId}`)
    .addFields(
      { name: 'Action', value: modCase.action, inline: true },
      { name: 'Status', value: getStatusLabel(modCase), inline: true },
      { name: 'User ID', value: modCase.userId, inline: true },
      { name: 'Moderator ID', value: modCase.moderatorId, inline: true },
      { name: 'Reason', value: modCase.reason || 'No reason provided', inline: false },
      {
        name: 'Created',
        value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`,
        inline: true,
      },
      {
        name: 'Updated',
        value: modCase.updatedAt
          ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>`
          : 'Never',
        inline: true,
      }
    )
    .setTimestamp();

  if (modCase.relatedCaseId) {
    embed.addFields({
      name: 'Related Case',
      value: `#${modCase.relatedCaseId}`,
      inline: true,
    });
  }

  if (modCase.note && String(modCase.note).trim()) {
    embed.addFields({
      name: 'Staff Note',
      value: String(modCase.note).slice(0, 1024),
      inline: false,
    });
  }

  if (modCase.metadata && Object.keys(modCase.metadata).length) {
    embed.addFields({
      name: 'Metadata',
      value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2).slice(0, 900)}\n\`\`\``,
      inline: false,
    });
  }

  return embed;
}

async function handleSelectUserModal(interaction) {
  if (interaction.customId !== 'mod_select_user_modal') return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const query = interaction.fields.getTextInputValue('target_user_query').trim();
  const target = await findMemberByQuery(interaction.guild, query);

  if (!target) {
    return safeReply(
      interaction,
      ephemeralError('User not found by that ID, username, tag, or display name.')
    );
  }

  const payload = await buildDashboardPayload(
    Discord,
    interaction,
    target,
    'overview'
  );

  return safeReply(interaction, {
    ...payload,
    flags: 64,
  });
}

async function handleBulkModals(interaction) {
  const map = {
    mod_submit_bulk_warn: 'warn',
    mod_submit_bulk_timeout: 'timeout',
    mod_submit_bulk_kick: 'kick',
    mod_submit_bulk_ban: 'ban',
  };

  const actionType = map[interaction.customId];
  if (!actionType) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const permissionKey = `bulk_${actionType}`;

  if (!canUseModAction(interaction.member, interaction.guild, permissionKey)) {
    return safeReply(
      interaction,
      ephemeralError(`No permission to use bulk ${actionType}.`)
    );
  }

  const ids = interaction.fields.getTextInputValue('users').split(',');
  const reason = interaction.fields.getTextInputValue('reason');

  const payload = {
    actionType,
    ids,
    reason,
  };

  if (actionType === 'timeout') {
    payload.durationRaw = interaction.fields.getTextInputValue('duration');
  }

  if (actionType === 'ban') {
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const deleteDays = parseDeleteDays(daysRaw);

    if (deleteDays === null) {
      return safeReply(
        interaction,
        ephemeralError('Delete message days must be 0-7.')
      );
    }

    payload.deleteDays = deleteDays;
  }

  return runBulkAction(interaction, payload);
}

async function handleCaseDetailModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_detail:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);

  if (!caseId) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
    return safeReply(interaction, ephemeralError('No permission to view case details.'));
  }

  const modCase = getCaseById(interaction.guild.id, caseId);

  if (!modCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  if (targetId !== 'none' && modCase.userId !== targetId) {
    return safeReply(
      interaction,
      ephemeralError('That case does not belong to the currently selected user.')
    );
  }

  return safeReply(interaction, {
    embeds: [buildCaseDetailEmbed(modCase)],
    components: buildCaseDetailButtons(modCase),
    flags: 64,
  });
}

async function handleEditCaseModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_edit_case:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);
  const reason = interaction.fields.getTextInputValue('reason').trim();

  if (!caseId) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) {
    return safeReply(interaction, ephemeralError('No permission to edit cases.'));
  }

  const existingCase = getCaseById(interaction.guild.id, caseId);

  if (!existingCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  if (targetId !== 'none' && existingCase.userId !== targetId) {
    return safeReply(
      interaction,
      ephemeralError('That case does not belong to the currently selected user.')
    );
  }

  const updated = updateCaseReason(interaction.guild.id, caseId, reason);

  if (!updated) {
    return safeReply(interaction, ephemeralError('Failed to update case.'));
  }

  const target = await fetchTarget(interaction.guild, updated.userId);

  await safeReply(interaction, {
    content: `✏️ Updated reason for **Case #${updated.caseId}**.`,
    flags: 64,
  });

  await refreshCasesDashboard(interaction, target);
  return true;
}

async function handleCaseNoteModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_note:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const caseId = getCaseIdFromModal(interaction, 'note');

  const [, caseIdRaw] = interaction.customId.split(':');
  const note = interaction.fields.getTextInputValue('note').trim();

  if (!/^\d+$/.test(caseIdRaw)) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) {
    return safeReply(interaction, ephemeralError('No permission to add case notes.'));
  }

  const numericCaseId = Number(caseIdRaw);
  const existingCase = getCaseById(interaction.guild.id, numericCaseId);

  if (!existingCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  const updated = note
    ? updateCaseNote(interaction.guild.id, numericCaseId, note)
    : clearCaseNote(interaction.guild.id, numericCaseId);

  if (!updated) {
    return safeReply(interaction, ephemeralError('Failed to update case note.'));
  }

  const target = await fetchTarget(interaction.guild, updated.userId);

  await safeReply(interaction, {
    content: note
      ? `📝 Updated note for **Case #${updated.caseId}**.`
      : `🗑️ Cleared note for **Case #${updated.caseId}**.`,
    flags: 64,
  });

  await refreshCasesDashboard(interaction, target);
  return true;
}

async function handleRemoveWarningModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_remove_warning:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);

  if (!caseId) {
    return safeReply(
      interaction,
      ephemeralError('Warning case ID must be a number.')
    );
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
    return replyNoPermission(interaction, 'remove_warning');
  }

  const warning = getWarningByCaseId(interaction.guild.id, caseId);

  if (!warning) {
    return safeReply(
      interaction,
      ephemeralError('Warning not found for that case ID.')
    );
  }

  if (targetId !== 'none' && warning.userId !== targetId) {
    return safeReply(
      interaction,
      ephemeralError('User not found for that case.')
    );
  }

  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId: warning.userId,
    type: 'remove-warning',
    payload: { caseId },
  });

  return safeReply(interaction, {
    content: `Remove warning linked to **Case #${caseId}**?`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, DEFAULT_DASHBOARD_CONTEXT)
    ),
    flags: 64,
  });
}

async function createPendingModerationAction(interaction, target, type, payload) {
  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId: target.id,
    type,
    payload,
  });

  return token;
}

async function handleBanModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_ban:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(
    interaction.guild,
    getTargetIdFromCustomId(interaction.customId)
  );

  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));

  if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
    return safeReply(interaction, ephemeralError('No permission to ban users.'));
  }

  const daysRaw = interaction.fields.getTextInputValue('days').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const deleteDays = parseDeleteDays(daysRaw);

  if (deleteDays === null) {
    return safeReply(
      interaction,
      ephemeralError('Delete message days must be 0-7.')
    );
  }

  const token = await createPendingModerationAction(interaction, target, 'ban', {
    reason,
    deleteDays,
  });

  return safeReply(interaction, {
    content: `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, DEFAULT_DASHBOARD_CONTEXT)
    ),
    flags: 64,
  });
}

async function handleKickModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_kick:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(
    interaction.guild,
    getTargetIdFromCustomId(interaction.customId)
  );

  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));

  if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
    return replyNoPermission(interaction, 'kick');
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();

  const token = await createPendingModerationAction(interaction, target, 'kick', {
    reason,
  });

  return safeReply(interaction, {
    content: `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, DEFAULT_DASHBOARD_CONTEXT)
    ),
    flags: 64,
  });
}

async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(
    interaction.guild,
    getTargetIdFromCustomId(interaction.customId)
  );

  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));

  if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
    return replyNoPermission(interaction, 'warn');
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const warnExpiryRaw =
    interaction.fields.getTextInputValue('warn_expiry') || 'never';

  const expiresAt = getWarningExpiry(warnExpiryRaw);

  if (warnExpiryRaw.trim().toLowerCase() !== 'never' && !expiresAt) {
    return safeReply(interaction, {
      content: '❌ Invalid warning expiry. Use `7d`, `2w`, `1m`, or `never`.',
      flags: 64,
    });
  }

  try {
    const modCase = createCase({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      action: 'warn',
      reason,
      metadata: { expiresAt },
    });

    addWarning({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      reason,
      caseId: modCase.caseId,
      expiresAt,
    });

    const repeatInfo = getRepeatReasonInfo({
      guildId: interaction.guild.id,
      userId: target.id,
      reason,
    });

    const escalatedCase = await handleEscalation({
      guild: interaction.guild,
      member: target,
      moderator: interaction.user,
      reason,
    });

    await sendModLog({
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      action: 'Warn',
      reason,
      caseId: modCase.caseId,
      metadata: {
        expiresAt,
        repeatPattern: Boolean(repeatInfo.isRepeatPattern),
        repeatCount: repeatInfo.repeatCount || 0,
        escalatedAction: escalatedCase?.action || null,
        escalatedCaseId: escalatedCase?.caseId || null,
      },
    });

    const extraLines = [];

    if (repeatInfo.isRepeatPattern) {
      extraLines.push(
        `🔁 Repeat reason detected (${repeatInfo.repeatCount} matching warnings)`
      );
    }

    if (escalatedCase) {
      extraLines.push(
        `⚡ Auto escalation triggered: **${escalatedCase.action}** (Case #${escalatedCase.caseId})`
      );
    }

    await safeReply(interaction, {
      content: [
        `⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`,
        ...extraLines,
      ].join('\n'),
      flags: 64,
    });

    await refreshCasesDashboard(interaction, target);
    return true;
  } catch (error) {
    console.error('❌ Warn error:', error);

    return safeReply(interaction, {
      content: '❌ Failed to warn user.',
      flags: 64,
    });
  }
}

async function handleTimeoutModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_timeout:')) return false;

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(
    interaction.guild,
    getTargetIdFromCustomId(interaction.customId)
  );

  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));

  if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
    return replyNoPermission(interaction, 'timeout');
  }

  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const durationMs = parseDuration(durationRaw);

  if (!durationMs) {
    return safeReply(interaction, {
      content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
      flags: 64,
    });
  }

  if (!isValidTimeoutDuration(durationMs)) {
    return safeReply(interaction, {
      content: '❌ Timeout cannot exceed 28 days.',
      flags: 64,
    });
  }

  try {
    await target.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);

    const modCase = createCase({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      action: 'timeout',
      reason,
      metadata: { duration: durationRaw },
    });

    await sendModLog({
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      action: 'Timeout',
      reason,
      caseId: modCase.caseId,
      metadata: { duration: durationRaw },
    });

    await safeReply(interaction, {
      content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`,
      flags: 64,
    });

    await refreshCasesDashboard(interaction, target);
    return true;
  } catch (error) {
    console.error('❌ Timeout error:', error);

    return safeReply(interaction, {
      content: '❌ Failed to timeout user.',
      flags: 64,
    });
  }
}

async function routeModModal(interaction) {
  if (!interaction?.customId?.startsWith('mod_')) return false;

  await syncExpiredWarningsToCases(interaction.guild.id);

  const handlers = [
    handleSelectUserModal,
    handleCaseNoteModal,
    handleBulkModals,
    handleCaseDetailModal,
    handleEditCaseModal,
    handleRemoveWarningModal,
    handleBanModal,
    handleKickModal,
    handleWarnModal,
    handleTimeoutModal,
  ];

  for (const handler of handlers) {
    const result = await handler(interaction);
    if (result) return result;
  }

  return false;
}

module.exports = {
  ensureModalAccess,
  routeModModal,

  handleSelectUserModal,
  handleCaseNoteModal,
  handleBulkModals,
  handleCaseDetailModal,
  handleEditCaseModal,
  handleRemoveWarningModal,
  handleBanModal,
  handleKickModal,
  handleWarnModal,
  handleTimeoutModal,
};
