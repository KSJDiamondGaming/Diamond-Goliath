const Discord = require('discord.js');
const { MessageFlags, EmbedBuilder } = require('discord.js');

const {
  hasModPermission,
  canUseModAction,
  getModActionDeniedMessage
} = require('../admin/permissionChecks');

const {
  checkHierarchy
} = require('../admin/hierarchyChecks');

const {
  fetchTarget,
  findMemberByQuery,
  parseDuration,
  isValidTimeoutDuration,
  getWarningExpiry,
  parseDeleteDays
} = require('./targetHelpers');

const {
  getStatusLabel,
  syncExpiredWarningsToCases
} = require('./caseHelpers');

const {
  runBulkAction
} = require('./bulkActionRunner');

const {
  refreshDashboard
} = require('./dashboardService');

const {
  safeReply,
  ephemeralError
} = require('../utility/interactionResponse');

const {
  buildCaseDetailButtons
} = require('../utility/caseComponentBuilders');

const {
  buildConfirmRow,
  buildConfirmCustomId
} = require('../utility/pendingActionHelpers');

const {
  createCase,
  getCaseById,
  updateCaseReason,
  updateCaseNote,
  clearCaseNote
} = require('../logging/cases/caseStore');

const {
  addWarning,
  getWarningByCaseId
} = require('../logging/modlogs/warningStore');

const {
  createPendingAction
} = require('../logging/modlogs/pendingActionStore');

const { sendModLog } = require('../logging/modlogs/modLog');
const { handleEscalation, getRepeatReasonInfo } = require('../admin/escalationSystem');

// =========================
// 🛡️ Shared Guard
// =========================
function ensureModalAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(interaction, ephemeralError('No permission to use moderation panel.'));
  }

  return null;
}

// =========================
// 🧾 Case Detail Embed
// =========================
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
        inline: true
      },
      {
        name: 'Updated',
        value: modCase.updatedAt
          ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>`
          : 'Never',
        inline: true
      }
    )
    .setTimestamp();

  if (modCase.relatedCaseId) {
    embed.addFields({
      name: 'Related Case',
      value: `#${modCase.relatedCaseId}`,
      inline: true
    });
  }

  if (modCase.note && String(modCase.note).trim()) {
    embed.addFields({
      name: 'Staff Note',
      value: modCase.note.slice(0, 1024),
      inline: false
    });
  }

  if (modCase.metadata && Object.keys(modCase.metadata).length) {
    embed.addFields({
      name: 'Metadata',
      value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2)}\n\`\`\``,
      inline: false
    });
  }

  return embed;
}

// =========================
// 📝 Case Note Modal Submit
// =========================
async function handleCaseNoteModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_note:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, caseIdRaw] = interaction.customId.split(':');
  const note = interaction.fields.getTextInputValue('note').trim();

  if (!/^\d+$/.test(caseIdRaw)) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) {
    return safeReply(interaction, ephemeralError('No permission to add case notes.'));
  }

  const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
  if (!existingCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  const updated = note
    ? updateCaseNote(interaction.guild.id, Number(caseIdRaw), note)
    : clearCaseNote(interaction.guild.id, Number(caseIdRaw));

  if (!updated) {
    return safeReply(interaction, ephemeralError('Failed to update case note.'));
  }

  const target = await fetchTarget(interaction.guild, updated.userId);

  await safeReply(interaction, {
    content: note
      ? `📝 Updated note for **Case #${updated.caseId}**.`
      : `🗑️ Cleared note for **Case #${updated.caseId}**.`,
    flags: MessageFlags.Ephemeral
  });

  if (target) {
    await refreshDashboard(Discord, interaction, target, {
      view: 'cases',
      actionFilter: 'all',
      statusFilter: 'all',
      page: 0
    });
  }

  return true;
}

// =========================
// 📦 Bulk Modals
// =========================
async function handleBulkModals(interaction) {
  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  if (interaction.customId === 'mod_submit_bulk_warn') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_warn')) {
      return safeReply(interaction, ephemeralError('No permission to warn users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'warn',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_timeout') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_timeout')) {
      return safeReply(interaction, ephemeralError('No permission to timeout users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const durationRaw = interaction.fields.getTextInputValue('duration');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'timeout',
      ids,
      reason,
      durationRaw
    });
  }

  if (interaction.customId === 'mod_submit_bulk_kick') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_kick')) {
      return safeReply(interaction, ephemeralError('No permission to kick users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'kick',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_ban') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_ban')) {
      return safeReply(interaction, ephemeralError('No permission to ban users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const reason = interaction.fields.getTextInputValue('reason');
    const deleteDays = parseDeleteDays(daysRaw);

    if (deleteDays === null) {
      return safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
    }

    return runBulkAction(interaction, {
      actionType: 'ban',
      ids,
      reason,
      deleteDays
    });
  }

  return false;
}

// =========================
// 🧾 Case Detail Modal
// =========================
async function handleCaseDetailModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_detail:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

  if (!/^\d+$/.test(caseIdRaw)) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
    return safeReply(interaction, ephemeralError('No permission to view case details.'));
  }

  const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

  if (!modCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  if (targetId !== 'none' && modCase.userId !== targetId) {
    return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
  }

  return safeReply(interaction, {
    embeds: [buildCaseDetailEmbed(modCase)],
    components: buildCaseDetailButtons(modCase),
    flags: MessageFlags.Ephemeral
  });
}

// =========================
// ✏️ Edit Case Modal
// =========================
async function handleEditCaseModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_edit_case:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();

  if (!/^\d+$/.test(caseIdRaw)) {
    return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) {
    return safeReply(interaction, ephemeralError('No permission to edit cases.'));
  }

  const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
  if (!existingCase) {
    return safeReply(interaction, ephemeralError('Case not found.'));
  }

  if (targetId !== 'none' && existingCase.userId !== targetId) {
    return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
  }

  const updated = updateCaseReason(interaction.guild.id, Number(caseIdRaw), reason);
  if (!updated) {
    return safeReply(interaction, ephemeralError('Failed to update case.'));
  }

  const target = await fetchTarget(interaction.guild, updated.userId);

  await safeReply(interaction, {
    content: `✏️ Updated reason for **Case #${updated.caseId}**.`,
    flags: MessageFlags.Ephemeral
  });

  if (target) {
    await refreshDashboard(Discord, interaction, target, {
      view: 'cases',
      actionFilter: 'all',
      statusFilter: 'all',
      page: 0
    });
  }

  return true;
}

// =========================
// 🗑️ Remove Warning Modal
// =========================
async function handleRemoveWarningModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_remove_warning:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

  if (!/^\d+$/.test(caseIdRaw)) {
    return safeReply(interaction, ephemeralError('Warning case ID must be a number.'));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
    return safeReply(interaction, {
      content: getModActionDeniedMessage('remove_warning'),
      flags: MessageFlags.Ephemeral
    });
  }

  const warning = getWarningByCaseId(interaction.guild.id, Number(caseIdRaw));
  if (!warning) {
    return safeReply(interaction, ephemeralError('Warning not found for that case ID.'));
  }

  if (targetId !== 'none' && warning.userId !== targetId) {
    return safeReply(interaction, ephemeralError('User not found for that case.'));
  }

  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId: warning.userId,
    type: 'remove-warning',
    payload: { caseId: Number(caseIdRaw) }
  });

  return safeReply(interaction, {
    content: `Remove warning linked to **Case #${caseIdRaw}**?`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      })
    ),
    flags: MessageFlags.Ephemeral
  });
}

// =========================
// 🔨 Ban Modal
// =========================
async function handleBanModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_ban:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const target = await fetchTarget(interaction.guild, targetId);
  const error = checkHierarchy(interaction, target);

  if (error) {
    return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
    return safeReply(interaction, ephemeralError('No permission to ban users.'));
  }

  const daysRaw = interaction.fields.getTextInputValue('days').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const deleteDays = parseDeleteDays(daysRaw);

  if (deleteDays === null) {
    return safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
  }

  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId: target.id,
    type: 'ban',
    payload: { reason, deleteDays }
  });

  return safeReply(interaction, {
    content: `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      })
    ),
    flags: MessageFlags.Ephemeral
  });
}

// =========================
// 👢 Kick Modal
// =========================
async function handleKickModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_kick:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const target = await fetchTarget(interaction.guild, targetId);
  const error = checkHierarchy(interaction, target);

  if (error) {
    return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
    return safeReply(interaction, {
      content: getModActionDeniedMessage('kick'),
      flags: MessageFlags.Ephemeral
    });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();

  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId: target.id,
    type: 'kick',
    payload: { reason }
  });

  return safeReply(interaction, {
    content: `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`,
    components: buildConfirmRow(
      buildConfirmCustomId(token, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      })
    ),
    flags: MessageFlags.Ephemeral
  });
}

// =========================
// ⚠️ Warn Modal
// =========================
async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const target = await fetchTarget(interaction.guild, targetId);
  const error = checkHierarchy(interaction, target);

  if (error) {
    return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
    return safeReply(interaction, {
      content: getModActionDeniedMessage('warn'),
      flags: MessageFlags.Ephemeral
    });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const warnExpiryRaw = interaction.fields.getTextInputValue('warn_expiry') || 'never';
  const expiresAt = getWarningExpiry(warnExpiryRaw);

  if (warnExpiryRaw.trim().toLowerCase() !== 'never' && !expiresAt) {
    return safeReply(interaction, {
      content: '❌ Invalid warning expiry. Use `7d`, `2w`, `1m`, or `never`.',
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    const modCase = createCase({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      action: 'warn',
      reason,
      metadata: { expiresAt }
    });

    addWarning({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      reason,
      caseId: modCase.caseId,
      expiresAt
    });

    let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };
    let escalatedCase = null;

    try {
      repeatInfo = getRepeatReasonInfo({
        guildId: interaction.guild.id,
        userId: target.id,
        reason
      }) || repeatInfo;
    } catch (repeatError) {
      console.error('Warn repeat check failed:', repeatError);
    }

    try {
      escalatedCase = await handleEscalation({
        guild: interaction.guild,
        member: target,
        moderator: interaction.user,
        reason
      });
    } catch (escalationError) {
      console.error('Warn escalation failed:', escalationError);
    }

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
        escalatedCaseId: escalatedCase?.caseId || null
      }
    });

    const extraLines = [];

    if (repeatInfo.isRepeatPattern) {
      extraLines.push(`🔁 Repeat reason detected (${repeatInfo.repeatCount} matching warnings)`);
    }

    if (escalatedCase) {
      extraLines.push(`⚡ Auto escalation triggered: **${escalatedCase.action}** (Case #${escalatedCase.caseId})`);
    }

    await safeReply(interaction, {
      content: [
        `⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`,
        ...extraLines
      ].join('\n'),
      flags: MessageFlags.Ephemeral
    });

    await refreshDashboard(Discord, interaction, target, {
      view: 'cases',
      actionFilter: 'all',
      statusFilter: 'all',
      page: 0
    });

    return true;
  } catch (err) {
    console.error('Warn error:', err);
    return safeReply(interaction, {
      content: '❌ Failed to warn user.',
      flags: MessageFlags.Ephemeral
    });
  }
}

// =========================
// ⏳ Timeout Modal
// =========================
async function handleTimeoutModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_timeout:')) {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const target = await fetchTarget(interaction.guild, targetId);
  const error = checkHierarchy(interaction, target);

  if (error) {
    return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
  }

  if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
    return safeReply(interaction, {
      content: getModActionDeniedMessage('timeout'),
      flags: MessageFlags.Ephemeral
    });
  }

  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const durationMs = parseDuration(durationRaw);

  if (!durationMs) {
    return safeReply(interaction, {
      content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (!isValidTimeoutDuration(durationMs)) {
    return safeReply(interaction, {
      content: '❌ Timeout cannot exceed 28 days.',
      flags: MessageFlags.Ephemeral
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
      metadata: { duration: durationRaw }
    });

    await sendModLog({
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      action: 'Timeout',
      reason,
      caseId: modCase.caseId,
      metadata: { duration: durationRaw }
    });

    await safeReply(interaction, {
      content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`,
      flags: MessageFlags.Ephemeral
    });

    await refreshDashboard(Discord, interaction, target, {
      view: 'cases',
      actionFilter: 'all',
      statusFilter: 'all',
      page: 0
    });

    return true;
  } catch (err) {
    console.error('Timeout error:', err);
    return safeReply(interaction, {
      content: '❌ Failed to timeout user.',
      flags: MessageFlags.Ephemeral
    });
  }
}

// =========================
// 👤 Optional Search Modal
// =========================
async function handleSelectUserModal(interaction) {
  if (interaction.customId !== 'mod_select_user_modal') {
    return false;
  }

  const denied = ensureModalAccess(interaction);
  if (denied) return denied;

  const query = interaction.fields.getTextInputValue('target_user_query').trim();
  const target = await findMemberByQuery(interaction.guild, query);

  if (!target) {
    return safeReply(interaction, ephemeralError('User not found by that ID, username, tag, or display name.'));
  }

  const { buildDashboardPayload } = require('./dashboardService');
  const payload = await buildDashboardPayload(Discord, interaction, target, 'overview');

  return safeReply(interaction, {
    ...payload,
    flags: MessageFlags.Ephemeral
  });
}

// =========================
// 🧠 Master Modal Router
// =========================
async function routeModModal(interaction) {
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
    handleTimeoutModal
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
  handleTimeoutModal
};