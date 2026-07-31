'use strict';

const Discord = require('discord.js');

const { safeReply } = require('../../../core/ui/interactionResponse');
const {
  fetchTarget,
  ensurePanelAccess,
  ensureActionAccess,
  requireModeratableTarget,
} = require('./permissions');
const {
  buildPunishmentModal,
  buildBulkModal,
  submitPunishmentRequest,
  submitBulkModal,
  createConfirmation,
  executePendingAction,
} = require('./punishments');
const {
  syncExpiredWarningsToCases,
  showWarningModal,
  showRemoveWarningModal,
  submitWarningModal,
  submitRemoveWarningRequest,
} = require('./warns');
const {
  openCaseTool,
  handleCaseAction,
  submitCaseModal,
} = require('./cases');
const {
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handleSelectUserButton,
  handleSelectUserModal,
} = require('./modPanel');

const OPEN_ACTIONS = Object.freeze({
  mod_open_warn: 'warn',
  mod_open_timeout: 'timeout',
  mod_open_kick: 'kick',
  mod_open_ban: 'ban',
});

const BULK_ACTIONS = Object.freeze({
  mod_bulk_warn: 'warn',
  mod_bulk_timeout: 'timeout',
  mod_bulk_kick: 'kick',
  mod_bulk_ban: 'ban',
});

const BULK_SUBMITS = Object.freeze({
  mod_submit_bulk_warn: 'warn',
  mod_submit_bulk_timeout: 'timeout',
  mod_submit_bulk_kick: 'kick',
  mod_submit_bulk_ban: 'ban',
});

const PUNISHMENT_SUBMITS = Object.freeze({
  mod_submit_ban: 'ban',
  mod_submit_kick: 'kick',
  mod_submit_timeout: 'timeout',
});

function isModCustomId(customId) {
  const id = String(customId || '');
  return id.startsWith('mod_') || id.startsWith('mod:');
}

function getTargetIdFromCustomId(customId) {
  return String(customId || '').split(':')[1] || 'none';
}

function parseConfirmActionContext(customId) {
  const parts = String(customId || '').split(':');
  return {
    token: parts[1] || null,
    context: {
      view: parts[2] || 'overview',
      actionFilter: parts[3] || 'all',
      statusFilter: parts[4] || 'all',
      page: Number(parts[5]) || 0,
    },
  };
}

async function showPunishmentModal(interaction, action, targetId) {
  const target = await requireModeratableTarget(interaction, targetId, action);
  if (!target) return true;
  await interaction.showModal(buildPunishmentModal(action, target.id));
  return true;
}

async function requestRemoveTimeout(interaction, targetId) {
  const target = await requireModeratableTarget(
    interaction,
    targetId,
    'remove_timeout'
  );
  if (!target) return true;

  return createConfirmation(
    interaction,
    target.id,
    'remove-timeout',
    {},
    `✅ Remove timeout from **${target.user.tag}**?`
  );
}

async function handleActionSelectMenu(interaction) {
  if (!interaction.customId.startsWith('mod_action_select:')) return false;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const selected = interaction.values[0];

  if (selected === 'warn') return showWarningModal(interaction, targetId);
  if (selected === 'remove-warning') return showRemoveWarningModal(interaction, targetId);
  if (selected === 'remove-timeout') return requestRemoveTimeout(interaction, targetId);
  if (PUNISHMENT_SUBMITS[`mod_submit_${selected}`]) {
    return showPunishmentModal(interaction, selected, targetId);
  }

  return false;
}

async function handleCancelButton(interaction) {
  if (interaction.customId !== 'mod_cancel_action') return false;

  if (interaction.message && typeof interaction.update === 'function') {
    await interaction.update({ content: '❌ Cancelled.', embeds: [], components: [] });
    return true;
  }

  return safeReply(interaction, { content: '❌ Cancelled.', flags: 64 });
}

async function handleBulkButton(interaction) {
  const action = BULK_ACTIONS[interaction.customId];
  if (!action) return false;

  const allowed = await ensureActionAccess(
    interaction,
    `bulk_${action}`,
    `❌ No permission to use bulk ${action}.`
  );
  if (!allowed) return true;

  await interaction.showModal(buildBulkModal(action));
  return true;
}

async function handleOpenActionButton(interaction) {
  if (!interaction.customId.startsWith('mod_open_')) return false;

  const [prefix, targetId] = interaction.customId.split(':');
  const action = OPEN_ACTIONS[prefix];
  if (!action) return false;
  if (action === 'warn') return showWarningModal(interaction, targetId);
  return showPunishmentModal(interaction, action, targetId);
}

async function handleCaseToolButton(interaction) {
  const caseResult = await openCaseTool(interaction);
  if (caseResult) return caseResult;

  const id = String(interaction.customId || '');
  const targetId = getTargetIdFromCustomId(id);

  if (id.startsWith('mod_remove_warning:')) {
    return showRemoveWarningModal(interaction, targetId);
  }

  if (id.startsWith('mod_remove_timeout:')) {
    return requestRemoveTimeout(interaction, targetId);
  }

  return false;
}

async function handleConfirmButton(interaction) {
  if (!interaction.customId.startsWith('mod_confirm_action:')) return false;
  const { token, context } = parseConfirmActionContext(interaction.customId);
  return executePendingAction(Discord, interaction, token, context);
}

async function handleBulkModal(interaction) {
  const actionType = BULK_SUBMITS[interaction.customId];
  if (!actionType) return false;

  const allowed = await ensureActionAccess(
    interaction,
    `bulk_${actionType}`,
    `❌ No permission to use bulk ${actionType}.`
  );
  if (!allowed) return true;

  return submitBulkModal(interaction, actionType);
}

async function handleRemoveWarningModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_remove_warning:')) return false;

  return submitRemoveWarningRequest(
    interaction,
    getTargetIdFromCustomId(interaction.customId),
    createConfirmation
  );
}

async function handlePunishmentModal(interaction) {
  const action = PUNISHMENT_SUBMITS[
    String(interaction.customId || '').split(':')[0]
  ];
  if (!action) return false;

  const target = await requireModeratableTarget(
    interaction,
    getTargetIdFromCustomId(interaction.customId),
    action
  );
  if (!target) return true;

  const result = await submitPunishmentRequest(interaction, target, action);
  if (action === 'timeout' && result?.ok) {
    await refreshCasesDashboard(interaction, target);
  }
  return true;
}

async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) return false;
  return submitWarningModal(
    interaction,
    getTargetIdFromCustomId(interaction.customId),
    refreshCasesDashboard
  );
}

async function routeHandlers(interaction, handlers) {
  for (const handler of handlers) {
    const result = await handler(interaction);
    if (result) return result;
  }
  return false;
}

async function routeButtonsAndSelects(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  if (interaction.isUserSelectMenu?.()) return handleUserSelectMenu(interaction);
  if (interaction.isStringSelectMenu?.()) return handleActionSelectMenu(interaction);
  if (!interaction.isButton?.()) return false;

  return routeHandlers(interaction, [
    handleConfirmButton,
    (value) => handleCaseAction(value, { fetchTarget, createConfirmation }),
    handleDashboardNavigation,
    handleCancelButton,
    handleSelectUserButton,
    handleBulkButton,
    handleOpenActionButton,
    handleCaseToolButton,
  ]);
}

async function routeModModal(interaction) {
  if (!interaction?.customId?.startsWith('mod_')) return false;

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  await syncExpiredWarningsToCases(interaction.guild.id);

  return routeHandlers(interaction, [
    handleSelectUserModal,
    (value) => submitCaseModal(value, { fetchTarget, refreshCasesDashboard }),
    handleBulkModal,
    handleRemoveWarningModal,
    handlePunishmentModal,
    handleWarnModal,
  ]);
}

async function handleModInteraction(interaction) {
  if (!interaction?.customId || !isModCustomId(interaction.customId)) return false;
  if (interaction.customId.startsWith('nav|')) return false;
  if (interaction.isModalSubmit?.()) return routeModModal(interaction);
  return routeButtonsAndSelects(interaction);
}

module.exports = {
  isModCustomId,
  handleModInteraction,
  routeModInteraction: routeButtonsAndSelects,
  routeModModal,
};