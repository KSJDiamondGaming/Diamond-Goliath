// functions/moderation/modInteractionRouter.js

const Discord = require('discord.js');

const {
  MessageFlags,
  ActionRowBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');

const {
  hasModPermission,
  canUseModAction,
  checkHierarchy,
} = require('./moderationChecks');

const { fetchTarget } = require('../../helpers/ui/targetHelpers');

const {
  buildReasonModal,
  buildBulkModal,
  buildCaseIdModal,
  buildEditCaseModal,
  buildCaseNoteModal,
} = require('../../helpers/ui/modalBuilders');

const {
  buildConfirmRow,
  buildConfirmCustomId,
  parseConfirmActionContext,
} = require('../../helpers/ui/pendingActionHelpers');

const {
  safeReply,
  ephemeralError,
} = require('../../helpers/ui/interactionResponse');

const { buildDashboardPayload } = require('./dashboardService');
const { executePendingAction } = require('./modActionExecutor');

const { getCaseById } = require('../../logging/cases/caseStore');
const { createPendingAction } = require('../../logging/stores/pendingActionStore');

const DEFAULT_DASHBOARD_CONTEXT = {
  view: 'cases',
  actionFilter: 'all',
  statusFilter: 'all',
  page: 0,
};

const OPEN_ACTIONS = {
  mod_open_warn: {
    permission: 'warn',
    modal: (targetId) =>
      buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true),
  },

  mod_open_timeout: {
    permission: 'timeout',
    modal: (targetId) =>
      buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true),
  },

  mod_open_kick: {
    permission: 'kick',
    modal: (targetId) =>
      buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User'),
  },

  mod_open_ban: {
    permission: 'ban',
    modal: (targetId) =>
      buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false),
  },
};

const ACTION_SELECT_MODALS = {
  warn: (targetId) =>
    buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true),

  timeout: (targetId) =>
    buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true),

  kick: (targetId) =>
    buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User'),

  ban: (targetId) =>
    buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false),

  'remove-warning': (targetId) =>
    buildCaseIdModal(
      `mod_submit_remove_warning:${targetId}`,
      'Remove Warning',
      'Warning Case ID'
    ),
};

const BULK_ACTIONS = {
  mod_bulk_warn: {
    permission: 'bulk_warn',
    modal: () => buildBulkModal('warn'),
    label: 'bulk warn',
  },

  mod_bulk_timeout: {
    permission: 'bulk_timeout',
    modal: () => buildBulkModal('timeout'),
    label: 'bulk timeout',
  },

  mod_bulk_kick: {
    permission: 'bulk_kick',
    modal: () => buildBulkModal('kick'),
    label: 'bulk kick',
  },

  mod_bulk_ban: {
    permission: 'bulk_ban',
    modal: () => buildBulkModal('ban'),
    label: 'bulk ban',
  },
};

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function ensurePanelAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(
      interaction,
      ephemeralError('No permission to use moderation panel.')
    );
  }

  return null;
}

function getTargetIdFromCustomId(customId) {
  const [, targetId] = String(customId || '').split(':');
  return targetId || 'none';
}

async function requireSelectedTarget(interaction, targetId) {
  if (!targetId || targetId === 'none') {
    await safeReply(interaction, ephemeralError('No user selected.'));
    return null;
  }

  const target = await fetchTarget(interaction.guild, targetId);

  if (!target) {
    await safeReply(interaction, ephemeralError('Could not find that user.'));
    return null;
  }

  return target;
}

async function createConfirmation(interaction, targetId, type, payload, message) {
  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId,
    type,
    payload,
  });

  return safeReply(interaction, {
    content: message,
    components: buildConfirmRow(
      buildConfirmCustomId(token, DEFAULT_DASHBOARD_CONTEXT)
    ),
    ephemeral: true,
  });
}

// =========================
// 👤 User Select Menu Handler
// =========================

async function handleUserSelectMenu(interaction) {
  if (interaction.customId !== 'mod_user_select') return false;

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const userId = interaction.values[0];
  const target = await fetchTarget(interaction.guild, userId);

  if (!target) {
    return safeReply(interaction, {
      content: '❌ Could not find that user.',
      ephemeral: true,
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
  if (!interaction.customId.startsWith('mod_action_select:')) return false;

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const selected = interaction.values[0];

  const modalBuilder = ACTION_SELECT_MODALS[selected];

  if (modalBuilder) {
    await interaction.showModal(modalBuilder(targetId));
    return true;
  }

  if (selected === 'remove-timeout') {
    const target = await requireSelectedTarget(interaction, targetId);
    if (!target) return true;

    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(cleanError(error)));
    }

    return createConfirmation(
      interaction,
      targetId,
      'remove-timeout',
      {},
      `✅ Remove timeout from **${target.user.tag}**?`
    );
  }

  return false;
}

// =========================
// 🧰 Utility / Bulk / Open Buttons
// =========================

async function handleCancelButton(interaction) {
  if (interaction.customId !== 'mod_cancel_action') return false;

  return safeReply(interaction, {
    content: '❌ Cancelled.',
    ephemeral: true,
  });
}

async function handleSelectUserButton(interaction) {
  if (interaction.customId !== 'mod_select_user') return false;

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
    ephemeral: true,
  });
}

async function handleBulkButtons(interaction) {
  const config = BULK_ACTIONS[interaction.customId];
  if (!config) return false;

  if (!canUseModAction(interaction.member, interaction.guild, config.permission)) {
    return safeReply(
      interaction,
      ephemeralError(`No permission to use ${config.label}.`)
    );
  }

  await interaction.showModal(config.modal());
  return true;
}

async function handleOpenActionButtons(interaction) {
  if (!interaction.customId.startsWith('mod_open_')) return false;

  const [prefix, targetId] = interaction.customId.split(':');
  const config = OPEN_ACTIONS[prefix];

  if (!config) return false;

  const target = await requireSelectedTarget(interaction, targetId);
  if (!target) return true;

  const error = checkHierarchy(interaction, target);

  if (error) {
    return safeReply(interaction, ephemeralError(cleanError(error)));
  }

  if (!canUseModAction(interaction.member, interaction.guild, config.permission)) {
    return safeReply(
      interaction,
      ephemeralError(`No permission to ${config.permission} users.`)
    );
  }

  await interaction.showModal(config.modal(targetId));
  return true;
}

async function handleCaseToolButtons(interaction) {
  if (interaction.customId.startsWith('mod_case_detail:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
      return safeReply(
        interaction,
        ephemeralError('No permission to view case details.')
      );
    }

    const targetId = getTargetIdFromCustomId(interaction.customId);

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

    const targetId = getTargetIdFromCustomId(interaction.customId);

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
      return safeReply(
        interaction,
        ephemeralError('No permission to remove warnings.')
      );
    }

    const targetId = getTargetIdFromCustomId(interaction.customId);

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
      return safeReply(
        interaction,
        ephemeralError('No permission to remove timeouts.')
      );
    }

    const targetId = getTargetIdFromCustomId(interaction.customId);
    const target = await requireSelectedTarget(interaction, targetId);
    if (!target) return true;

    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(cleanError(error)));
    }

    return createConfirmation(
      interaction,
      targetId,
      'remove-timeout',
      {},
      `✅ Remove timeout from **${target.user.tag}**?`
    );
  }

  return false;
}

async function handleUtilityButtons(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const handlers = [
    handleCancelButton,
    handleSelectUserButton,
    handleBulkButtons,
    handleOpenActionButtons,
    handleCaseToolButtons,
  ];

  for (const handler of handlers) {
    const result = await handler(interaction);
    if (result) return result;
  }

  return false;
}

// =========================
// 🧾 Case Action Buttons
// =========================

async function handleCaseNoteButton(interaction) {
  if (!interaction.customId.startsWith('mod_case_note:')) return false;

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
    buildCaseNoteModal(
      `mod_submit_case_note:${existingCase.caseId}`,
      existingCase.note || ''
    )
  );

  return true;
}

async function handleReverseWarningButton(interaction) {
  if (!interaction.customId.startsWith('mod_case_reverse_warning:')) {
    return false;
  }

  const [, caseIdRaw] = interaction.customId.split(':');
  const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

  if (!modCase || modCase.action !== 'warn') {
    return safeReply(interaction, ephemeralError('Warning case could not be found.'));
  }

  const target = await fetchTarget(interaction.guild, modCase.userId);

  if (!target) {
    return safeReply(interaction, ephemeralError('User not found for that case.'));
  }

  return createConfirmation(
    interaction,
    target.id,
    'remove-warning',
    { caseId: modCase.caseId },
    `⚠️ Reverse warning from **Case #${modCase.caseId}**?`
  );
}

async function handleReverseTimeoutButton(interaction) {
  if (!interaction.customId.startsWith('mod_case_reverse_timeout:')) {
    return false;
  }

  const [, caseIdRaw] = interaction.customId.split(':');
  const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

  if (!modCase || modCase.action !== 'timeout') {
    return safeReply(
      interaction,
      ephemeralError('That timeout case could not be found.')
    );
  }

  const target = await fetchTarget(interaction.guild, modCase.userId);

  if (!target) {
    return safeReply(interaction, ephemeralError('User not found for that case.'));
  }

  return createConfirmation(
    interaction,
    target.id,
    'remove-timeout',
    { sourceCaseId: modCase.caseId },
    `⏳ Reverse timeout from **Case #${modCase.caseId}**?`
  );
}

async function handleCaseActionButtons(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const handlers = [
    handleCaseNoteButton,
    handleReverseWarningButton,
    handleReverseTimeoutButton,
  ];

  for (const handler of handlers) {
    const result = await handler(interaction);
    if (result) return result;
  }

  return false;
}

// =========================
// ✅ Confirm Action Buttons
// =========================

async function handleConfirmButtons(interaction) {
  if (!interaction.customId.startsWith('mod_confirm_action:')) return false;

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
    handleUtilityButtons,
  ];

  for (const handler of handlers) {
    const result = await handler(interaction);
    if (result) return result;
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

  routeModInteraction,
};