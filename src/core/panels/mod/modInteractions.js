'use strict';

const Discord = require('discord.js');
const { ActionRowBuilder, UserSelectMenuBuilder } = Discord;

const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const {
  hasModPermission,
  canUseModAction,
  getModActionDeniedMessage,
  checkHierarchy,
} = require('./permissions');
const {
  fetchTarget,
  buildPunishmentModal,
  buildBulkModal,
  submitPunishmentRequest,
  submitBulkModal,
  createPendingAction,
  executePendingAction,
} = require('./punishments');
const {
  syncExpiredWarningsToCases,
  buildWarnModal,
  buildRemoveWarningModal,
  submitWarning,
  submitRemoveWarningRequest,
} = require('./warns');
const {
  openCaseTool,
  handleCaseAction,
  submitCaseModal,
} = require('./cases');

const DEFAULT_DASHBOARD_CONTEXT = Object.freeze({
  view: 'cases',
  actionFilter: 'all',
  statusFilter: 'all',
  page: 0,
});

const ACTION_MODALS = Object.freeze({
  warn: { permission: 'warn', build: buildWarnModal },
  timeout: { permission: 'timeout', build: (id) => buildPunishmentModal('timeout', id) },
  kick: { permission: 'kick', build: (id) => buildPunishmentModal('kick', id) },
  ban: { permission: 'ban', build: (id) => buildPunishmentModal('ban', id) },
  'remove-warning': { permission: 'remove_warning', build: buildRemoveWarningModal },
});

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

function ensurePanelAccess(interaction) {
  if (hasModPermission(interaction.member)) return null;
  return safeReply(interaction, ephemeralError('No permission to use moderation panel.'));
}

function getTargetIdFromCustomId(customId) {
  return String(customId || '').split(':')[1] || 'none';
}

function normalizeDashboardContext(context = {}) {
  return {
    view: context.view || 'overview',
    actionFilter: context.actionFilter || 'all',
    statusFilter: context.statusFilter || 'all',
    page: Number(context.page) || 0,
  };
}

function parseConfirmActionContext(customId) {
  const parts = String(customId || '').split(':');
  return {
    token: parts[1] || null,
    context: normalizeDashboardContext({
      view: parts[2] || 'overview',
      actionFilter: parts[3] || 'all',
      statusFilter: parts[4] || 'all',
      page: parts[5],
    }),
  };
}

function buildConfirmCustomId(token, context = {}) {
  const value = normalizeDashboardContext(context);
  return [
    'mod_confirm_action',
    token,
    value.view,
    value.actionFilter,
    value.statusFilter,
    value.page,
  ].join(':');
}

function buildConfirmRow(confirmId) {
  return [
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('⚠️ Confirm')
        .setStyle(Discord.ButtonStyle.Danger),
      new Discord.ButtonBuilder()
        .setCustomId('mod_cancel_action')
        .setLabel('❌ Cancel')
        .setStyle(Discord.ButtonStyle.Secondary)
    ),
  ];
}

async function createConfirmation(
  interaction,
  targetId,
  type,
  payload,
  message,
  context = DEFAULT_DASHBOARD_CONTEXT
) {
  const token = createPendingAction(interaction.guild.id, {
    moderatorId: interaction.user.id,
    targetId,
    type,
    payload,
  });

  return safeReply(interaction, {
    content: message,
    components: buildConfirmRow(buildConfirmCustomId(token, context)),
    flags: 64,
  });
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

async function requireModeratableTarget(interaction, targetId, permission) {
  const target = await requireSelectedTarget(interaction, targetId);
  if (!target) return null;

  const hierarchyError = checkHierarchy(interaction, target);
  if (hierarchyError) {
    await safeReply(
      interaction,
      ephemeralError(String(hierarchyError).replace(/^❌\s*/, ''))
    );
    return null;
  }

  if (!canUseModAction(interaction.member, interaction.guild, permission)) {
    await safeReply(interaction, {
      content: getModActionDeniedMessage(permission),
      flags: 64,
    });
    return null;
  }

  return target;
}

async function renderDashboard(interaction, targetId, view = 'overview', context = {}) {
  const target = targetId && targetId !== 'none'
    ? await fetchTarget(interaction.guild, targetId)
    : null;

  if (targetId && targetId !== 'none' && !target) {
    return safeReply(interaction, ephemeralError('Could not find the selected user.'));
  }

  const { buildDashboardPayload } = require('./modPanel');
  await interaction.update(
    await buildDashboardPayload(Discord, interaction, target, view, context)
  );
  return true;
}

async function refreshCasesDashboard(interaction, target) {
  if (!target) return false;
  const { refreshDashboard } = require('./modPanel');
  await refreshDashboard(Discord, interaction, target, DEFAULT_DASHBOARD_CONTEXT);
  return true;
}

async function findMemberByQuery(guild, query) {
  const raw = String(query || '').trim();
  if (!guild || !raw) return null;

  const mentionId = raw.match(/^<@!?(\d{16,20})>$/)?.[1];
  const directId = mentionId || (/^\d{16,20}$/.test(raw) ? raw : null);
  if (directId) {
    const direct = await fetchTarget(guild, directId);
    if (direct) return direct;
  }

  const needle = raw.toLowerCase();
  const valuesFor = (member) => [
    member.user?.username,
    member.user?.tag,
    member.displayName,
    member.nickname,
  ].map((value) => String(value || '').trim().toLowerCase());

  const exact = guild.members.cache.find((member) => valuesFor(member).includes(needle));
  if (exact) return exact;

  const partial = guild.members.cache.find((member) =>
    valuesFor(member).some((value) => value && value.includes(needle))
  );
  if (partial) return partial;

  try {
    const results = await guild.members.search({ query: raw, limit: 10 });
    return results.find((member) => valuesFor(member).includes(needle)) || results.first() || null;
  } catch {
    return null;
  }
}

async function showActionModal(interaction, action, targetId) {
  const config = ACTION_MODALS[action];
  if (!config) return false;

  const target = await requireModeratableTarget(
    interaction,
    targetId,
    config.permission
  );
  if (!target) return true;

  await interaction.showModal(config.build(target.id));
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

async function handleUserSelectMenu(interaction) {
  if (interaction.customId !== 'mod_user_select') return false;

  const target = await fetchTarget(interaction.guild, interaction.values[0]);
  if (!target) return safeReply(interaction, ephemeralError('Could not find that user.'));
  return renderDashboard(interaction, target.id, 'overview');
}

async function handleActionSelectMenu(interaction) {
  if (!interaction.customId.startsWith('mod_action_select:')) return false;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const selected = interaction.values[0];

  if (selected === 'remove-timeout') {
    return requestRemoveTimeout(interaction, targetId);
  }

  return showActionModal(interaction, selected, targetId);
}

async function handleDashboardNavigation(interaction) {
  const id = String(interaction.customId || '');
  if (id === 'mod:overview') return renderDashboard(interaction, 'none', 'overview');

  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) {
    const [, targetId = 'none', view = 'overview'] = id.split(':');
    return renderDashboard(interaction, targetId, view);
  }

  if (id.startsWith('mod_filter_cases:') || id.startsWith('mod_case_page:')) {
    const [, targetId = 'none', actionFilter = 'all', statusFilter = 'all', page = '0'] = id.split(':');
    return renderDashboard(interaction, targetId, 'cases', {
      actionFilter,
      statusFilter,
      page,
    });
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
    flags: 64,
  });
}

async function handleBulkButton(interaction) {
  const action = BULK_ACTIONS[interaction.customId];
  if (!action) return false;

  if (!canUseModAction(interaction.member, interaction.guild, `bulk_${action}`)) {
    return safeReply(
      interaction,
      ephemeralError(`No permission to use bulk ${action}.`)
    );
  }

  await interaction.showModal(buildBulkModal(action));
  return true;
}

async function handleOpenActionButton(interaction) {
  if (!interaction.customId.startsWith('mod_open_')) return false;

  const [prefix, targetId] = interaction.customId.split(':');
  const action = OPEN_ACTIONS[prefix];
  if (!action) return false;

  return showActionModal(interaction, action, targetId);
}

async function handleCaseToolButton(interaction) {
  const caseResult = await openCaseTool(interaction);
  if (caseResult) return caseResult;

  const id = String(interaction.customId || '');
  const targetId = getTargetIdFromCustomId(id);

  if (id.startsWith('mod_remove_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
      return safeReply(interaction, ephemeralError('No permission to remove warnings.'));
    }
    if (targetId === 'none') {
      return safeReply(interaction, ephemeralError('No user selected.'));
    }

    await interaction.showModal(buildRemoveWarningModal(targetId));
    return true;
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

async function handleSelectUserModal(interaction) {
  if (interaction.customId !== 'mod_select_user_modal') return false;

  const target = await findMemberByQuery(
    interaction.guild,
    interaction.fields.getTextInputValue('target_user_query')
  );
  if (!target) {
    return safeReply(
      interaction,
      ephemeralError('User not found by that ID, username, tag, or display name.')
    );
  }

  const { buildDashboardPayload } = require('./modPanel');
  return safeReply(interaction, {
    ...(await buildDashboardPayload(Discord, interaction, target, 'overview')),
    flags: 64,
  });
}

async function handleBulkModal(interaction) {
  const actionType = BULK_SUBMITS[interaction.customId];
  if (!actionType) return false;

  if (!canUseModAction(interaction.member, interaction.guild, `bulk_${actionType}`)) {
    return safeReply(
      interaction,
      ephemeralError(`No permission to use bulk ${actionType}.`)
    );
  }

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

  const result = await submitPunishmentRequest(
    interaction,
    target,
    action,
    createConfirmation
  );
  if (action === 'timeout' && result?.ok) {
    await refreshCasesDashboard(interaction, target);
  }
  return true;
}

async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) return false;

  const target = await requireModeratableTarget(
    interaction,
    getTargetIdFromCustomId(interaction.customId),
    'warn'
  );
  if (!target) return true;

  const result = await submitWarning(interaction, target);
  if (result?.ok) await refreshCasesDashboard(interaction, target);
  return true;
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
