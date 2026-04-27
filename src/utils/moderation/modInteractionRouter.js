const Discord = require('discord.js');

const {
  MessageFlags,
  ActionRowBuilder,
  UserSelectMenuBuilder
} = require('discord.js');

const {
  hasModPermission,
  canUseModAction
} = require('../admin/permissionChecks');

const {
  checkHierarchy
} = require('../admin/hierarchyChecks');

const {
  fetchTarget
} = require('../utility/targetHelpers');

const {
  buildReasonModal,
  buildBulkModal,
  buildCaseIdModal,
  buildEditCaseModal,
  buildCaseNoteModal
} = require('../utility/modalBuilders');

const {
  buildConfirmRow,
  buildConfirmCustomId,
  parseConfirmActionContext
} = require('../utility/pendingActionHelpers');

const {
  safeReply,
  ephemeralError
} = require('../utility/interactionResponse');

const {
  buildDashboardPayload
} = require('./dashboardService');

const {
  executePendingAction
} = require('./modActionExecutor');

const {
  getCaseById
} = require('../../core/modules/moderation/cases');

const {
  getWarningByCaseId
} = require('../logging/modlogs/warningStore');

const {
  createPendingAction
} = require('../logging/modlogs/pendingActionStore');

// =========================
// 🛡️ Shared Permission Guard
// =========================
function ensurePanelAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(
      interaction,
      ephemeralError('No permission to use moderation panel.')
    );
  }

  return null;
}

// =========================
// 👤 User Select Menu Handler
// =========================
async function handleUserSelectMenu(interaction) {
  if (interaction.customId !== 'mod_user_select') {
    return false;
  }

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const userId = interaction.values[0];
  const target = await fetchTarget(interaction.guild, userId);

  if (!target) {
    return safeReply(interaction, {
      content: '❌ Could not find that user.',
      flags: MessageFlags.Ephemeral
    });
  }

  const payload = await buildDashboardPayload(
    Discord,
    interaction,
    target,
    'overview'
  );

  await interaction.update(payload);
  return true;
}

// =========================
// ⚖️ Action Select Menu Handler
// =========================
async function handleActionSelectMenu(interaction) {
  if (!interaction.customId.startsWith('mod_action_select:')) {
    return false;
  }

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const [, targetId] = interaction.customId.split(':');
  const selected = interaction.values[0];

  if (selected === 'warn') {
    await interaction.showModal(
      buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true)
    );
    return true;
  }

  if (selected === 'timeout') {
    await interaction.showModal(
      buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true)
    );
    return true;
  }

  if (selected === 'kick') {
    await interaction.showModal(
      buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User')
    );
    return true;
  }

  if (selected === 'ban') {
    await interaction.showModal(
      buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false)
    );
    return true;
  }

  if (selected === 'remove-warning') {
    await interaction.showModal(
      buildCaseIdModal(
        `mod_submit_remove_warning:${targetId}`,
        'Remove Warning',
        'Warning Case ID'
      )
    );
    return true;
  }

  if (selected === 'remove-timeout') {
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId,
      type: 'remove-timeout',
      payload: {}
    });

    return safeReply(interaction, {
      content: `✅ Remove timeout from **${target.user.tag}**?`,
      components: [
        ...buildConfirmRow(
          buildConfirmCustomId(token, {
            view: 'cases',
            actionFilter: 'all',
            statusFilter: 'all',
            page: 0
          })
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}

// =========================
// 🧰 Tools / Bulk / Open Modal Buttons
// =========================
async function handleUtilityButtons(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  if (interaction.customId === 'mod_cancel_action') {
    return safeReply(interaction, {
      content: '❌ Cancelled.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_select_user') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('mod_user_select')
        .setPlaceholder('Select a user to moderate')
        .setMinValues(1)
        .setMaxValues(1)
    );

    return safeReply(interaction, {
      content: '👤 Select a user:',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_bulk_warn') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_warn')) {
      return safeReply(interaction, ephemeralError('No permission to use bulk warn.'));
    }

    await interaction.showModal(buildBulkModal('warn'));
    return true;
  }

  if (interaction.customId === 'mod_bulk_timeout') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_timeout')) {
      return safeReply(interaction, ephemeralError('No permission to use bulk timeout.'));
    }

    await interaction.showModal(buildBulkModal('timeout'));
    return true;
  }

  if (interaction.customId === 'mod_bulk_kick') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_kick')) {
      return safeReply(interaction, ephemeralError('No permission to use bulk kick.'));
    }

    await interaction.showModal(buildBulkModal('kick'));
    return true;
  }

  if (interaction.customId === 'mod_bulk_ban') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_ban')) {
      return safeReply(interaction, ephemeralError('No permission to use bulk ban.'));
    }

    await interaction.showModal(buildBulkModal('ban'));
    return true;
  }

  if (interaction.customId.startsWith('mod_open_')) {
    const [prefix, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('No user selected.'));
    }

    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
    }

    if (prefix === 'mod_open_warn') {
      if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
        return safeReply(interaction, ephemeralError('No permission to warn users.'));
      }

      await interaction.showModal(
        buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true)
      );
      return true;
    }

    if (prefix === 'mod_open_timeout') {
      if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
        return safeReply(interaction, ephemeralError('No permission to timeout users.'));
      }

      await interaction.showModal(
        buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true)
      );
      return true;
    }

    if (prefix === 'mod_open_kick') {
      if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
        return safeReply(interaction, ephemeralError('No permission to kick users.'));
      }

      await interaction.showModal(
        buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User')
      );
      return true;
    }

    if (prefix === 'mod_open_ban') {
      if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
        return safeReply(interaction, ephemeralError('No permission to ban users.'));
      }

      await interaction.showModal(
        buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false)
      );
      return true;
    }
  }

  if (interaction.customId.startsWith('mod_case_detail:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
      return safeReply(interaction, ephemeralError('No permission to view case details.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('No user selected.'));
    }

    await interaction.showModal(
      buildCaseIdModal(`mod_submit_case_detail:${targetId}`, 'View Case Detail')
    );
    return true;
  }

  if (interaction.customId.startsWith('mod_edit_case:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) {
      return safeReply(interaction, ephemeralError('No permission to edit cases.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('No user selected.'));
    }

    await interaction.showModal(
      buildEditCaseModal(`mod_submit_edit_case:${targetId}`)
    );
    return true;
  }

  if (interaction.customId.startsWith('mod_remove_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
      return safeReply(interaction, ephemeralError('No permission to remove warnings.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('No user selected.'));
    }

    await interaction.showModal(
      buildCaseIdModal(
        `mod_submit_remove_warning:${targetId}`,
        'Remove Warning',
        'Warning Case ID'
      )
    );
    return true;
  }

  if (interaction.customId.startsWith('mod_remove_timeout:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_timeout')) {
      return safeReply(interaction, ephemeralError('No permission to remove timeouts.'));
    }

    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error.replace(/^❌\s*/, '')));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId,
      type: 'remove-timeout',
      payload: {}
    });

    return safeReply(interaction, {
      content: `✅ Remove timeout from **${target.user.tag}**?`,
      components: [
        ...buildConfirmRow(
          buildConfirmCustomId(token, {
            view: 'cases',
            actionFilter: 'all',
            statusFilter: 'all',
            page: 0
          })
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}

// =========================
// 🧾 Case Action Buttons
// =========================
async function handleCaseActionButtons(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  if (interaction.customId.startsWith('mod_case_note:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) {
      return safeReply(interaction, ephemeralError('No permission to add case notes.'));
    }

    const [, caseIdRaw] = interaction.customId.split(':');

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    }

    const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!existingCase) {
      return safeReply(interaction, ephemeralError('Case not found.'));
    }

    await interaction.showModal(
      buildCaseNoteModal(`mod_submit_case_note:${existingCase.caseId}`, existingCase.note || '')
    );
    return true;
  }

  if (interaction.customId.startsWith('mod_case_reverse_warning:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'warn') {
      return safeReply(interaction, ephemeralError('User not found for that case.'));
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);

    if (!target) {
      return safeReply(interaction, ephemeralError('User not found for that case.'));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-warning',
      payload: { caseId: modCase.caseId }
    });

    return safeReply(interaction, {
      content: `⚠️ Reverse warning from **Case #${modCase.caseId}**?`,
      components: [
        ...buildConfirmRow(
          buildConfirmCustomId(token, {
            view: 'cases',
            actionFilter: 'all',
            statusFilter: 'all',
            page: 0
          })
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_reverse_timeout:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'timeout') {
      return safeReply(interaction, ephemeralError('That timeout case could not be found.'));
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);

    if (!target) {
      return safeReply(interaction, ephemeralError('User not found for that case.'));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-timeout',
      payload: { sourceCaseId: modCase.caseId }
    });

    return safeReply(interaction, {
      content: `⏳ Reverse timeout from **Case #${modCase.caseId}**?`,
      components: [
        ...buildConfirmRow(
          buildConfirmCustomId(token, {
            view: 'cases',
            actionFilter: 'all',
            statusFilter: 'all',
            page: 0
          })
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  return false;
}

// =========================
// ✅ Confirm Action Buttons
// =========================
async function handleConfirmButtons(interaction) {
  if (!interaction.customId.startsWith('mod_confirm_action:')) {
    return false;
  }

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const { token, context } = parseConfirmActionContext(interaction.customId);
  return executePendingAction(Discord, interaction, token, context);
}

// =========================
// 🧠 Master Router
// =========================
async function routeModInteraction(interaction) {
  if (interaction.isUserSelectMenu()) {
    return handleUserSelectMenu(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    return handleActionSelectMenu(interaction);
  }

  if (!interaction.isButton()) {
    return false;
  }

  const handlers = [
    handleConfirmButtons,
    handleCaseActionButtons,
    handleUtilityButtons
  ];

  for (const handler of handlers) {
    const result = await handler(interaction);

    if (result) {
      return result;
    }
  }

  return false;
}

module.exports = {
  ensurePanelAccess,
  handleUserSelectMenu,
  handleActionSelectMenu,
  handleUtilityButtons,
  handleCaseActionButtons,
  handleConfirmButtons,
  routeModInteraction
};