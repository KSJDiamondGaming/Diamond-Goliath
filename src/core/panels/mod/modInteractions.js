'use strict';

const Discord = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = Discord;

const { EMOJIS } = require('../../ui/uiConfig');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const {
  hasModPermission,
  canUseModAction,
  getModActionDeniedMessage,
  checkHierarchy,
} = require('./permissions');
const {
  parseDeleteDays,
  fetchTarget,
  buildPunishmentModal,
  buildBulkModal,
  submitTimeout,
  createPendingAction,
  executePendingAction,
  runBulkAction,
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

function isModCustomId(customId) {
  const id = String(customId || '');
  return id.startsWith('mod_') || id.startsWith('mod:');
}

function cleanError(error) {
  return String(error || '').replace(/^❌\s*/, '');
}

function ensurePanelAccess(interaction) {
  if (!hasModPermission(interaction.member)) {
    return safeReply(interaction, ephemeralError('No permission to use moderation panel.'));
  }
  return null;
}

function getTargetIdFromCustomId(customId) {
  const [, targetId] = String(customId || '').split(':');
  return targetId || 'none';
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
      page: Number(parts[5]) || 0,
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

function buildConfirmRow(confirmId, cancelId = 'mod_cancel_action') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(`${EMOJIS.WARNING} Confirm`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel(`${EMOJIS.ERROR} Cancel`)
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
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

async function renderDashboard(interaction, targetId, view = 'overview', context = {}) {
  const target = targetId && targetId !== 'none'
    ? await fetchTarget(interaction.guild, targetId)
    : null;

  if (targetId && targetId !== 'none' && !target) {
    return safeReply(interaction, ephemeralError('Could not find the selected user.'));
  }

  const { buildDashboardPayload } = require('./modPanel');
  const payload = await buildDashboardPayload(Discord, interaction, target, view, context);
  await interaction.update(payload);
  return true;
}

async function refreshCasesDashboard(interaction, target) {
  if (!target) return false;
  const { refreshDashboard } = require('./modPanel');
  await refreshDashboard(Discord, interaction, target, DEFAULT_DASHBOARD_CONTEXT);
  return true;
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

const OPEN_ACTIONS = Object.freeze({
  mod_open_warn: { permission: 'warn', modal: (id) => buildWarnModal(id) },
  mod_open_timeout: { permission: 'timeout', modal: (id) => buildPunishmentModal('timeout', id) },
  mod_open_kick: { permission: 'kick', modal: (id) => buildPunishmentModal('kick', id) },
  mod_open_ban: { permission: 'ban', modal: (id) => buildPunishmentModal('ban', id) },
});

const ACTION_SELECT_MODALS = Object.freeze({
  warn: (id) => buildWarnModal(id),
  timeout: (id) => buildPunishmentModal('timeout', id),
  kick: (id) => buildPunishmentModal('kick', id),
  ban: (id) => buildPunishmentModal('ban', id),
  'remove-warning': (id) => buildRemoveWarningModal(id),
});

const BULK_ACTIONS = Object.freeze({
  mod_bulk_warn: { permission: 'bulk_warn', modal: () => buildBulkModal('warn'), label: 'bulk warn' },
  mod_bulk_timeout: { permission: 'bulk_timeout', modal: () => buildBulkModal('timeout'), label: 'bulk timeout' },
  mod_bulk_kick: { permission: 'bulk_kick', modal: () => buildBulkModal('kick'), label: 'bulk kick' },
  mod_bulk_ban: { permission: 'bulk_ban', modal: () => buildBulkModal('ban'), label: 'bulk ban' },
});

async function handleUserSelectMenu(interaction) {
  if (interaction.customId !== 'mod_user_select') return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(interaction.guild, interaction.values[0]);
  if (!target) return safeReply(interaction, ephemeralError('Could not find that user.'));
  return renderDashboard(interaction, target.id, 'overview');
}

async function handleActionSelectMenu(interaction) {
  if (!interaction.customId.startsWith('mod_action_select:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const targetId = getTargetIdFromCustomId(interaction.customId);
  const selected = interaction.values[0];
  const modalBuilder = ACTION_SELECT_MODALS[selected];

  if (modalBuilder) {
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(modalBuilder(targetId));
    return true;
  }

  if (selected === 'remove-timeout') {
    const target = await requireSelectedTarget(interaction, targetId);
    if (!target) return true;
    const error = checkHierarchy(interaction, target);
    if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
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

async function handleDashboardNavigation(interaction) {
  const id = String(interaction.customId || '');
  if (id === 'mod:overview') return renderDashboard(interaction, 'none', 'overview');

  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) {
    const [, targetId = 'none', view = 'overview'] = id.split(':');
    return renderDashboard(interaction, targetId, view);
  }

  if (id.startsWith('mod_filter_cases:') || id.startsWith('mod_case_page:')) {
    const [, targetId = 'none', actionFilter = 'all', statusFilter = 'all', page = '0'] = id.split(':');
    return renderDashboard(interaction, targetId, 'cases', { actionFilter, statusFilter, page });
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

  return safeReply(interaction, { content: '👤 Select a user:', components: [row], flags: 64 });
}

async function handleBulkButtons(interaction) {
  const config = BULK_ACTIONS[interaction.customId];
  if (!config) return false;
  if (!canUseModAction(interaction.member, interaction.guild, config.permission)) {
    return safeReply(interaction, ephemeralError(`No permission to use ${config.label}.`));
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
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, config.permission)) {
    return safeReply(interaction, ephemeralError(`No permission to ${config.permission} users.`));
  }
  await interaction.showModal(config.modal(targetId));
  return true;
}

async function handleCaseToolButtons(interaction) {
  const result = await openCaseTool(interaction);
  if (result) return result;

  const id = String(interaction.customId || '');
  const targetId = getTargetIdFromCustomId(id);

  if (id.startsWith('mod_remove_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
      return safeReply(interaction, ephemeralError('No permission to remove warnings.'));
    }
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildRemoveWarningModal(targetId));
    return true;
  }

  if (id.startsWith('mod_remove_timeout:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_timeout')) {
      return safeReply(interaction, ephemeralError('No permission to remove timeouts.'));
    }
    const target = await requireSelectedTarget(interaction, targetId);
    if (!target) return true;
    const error = checkHierarchy(interaction, target);
    if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
    return createConfirmation(interaction, targetId, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`);
  }

  return false;
}

async function handleCaseActionButtons(interaction) {
  return handleCaseAction(interaction, { fetchTarget, createConfirmation });
}

async function handleConfirmButtons(interaction) {
  if (!interaction.customId.startsWith('mod_confirm_action:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const { token, context } = parseConfirmActionContext(interaction.customId);
  return executePendingAction(Discord, interaction, token, context);
}

async function handleSelectUserModal(interaction) {
  if (interaction.customId !== 'mod_select_user_modal') return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

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

async function handleBulkModals(interaction) {
  const map = {
    mod_submit_bulk_warn: 'warn',
    mod_submit_bulk_timeout: 'timeout',
    mod_submit_bulk_kick: 'kick',
    mod_submit_bulk_ban: 'ban',
  };
  const actionType = map[interaction.customId];
  if (!actionType) return false;

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  if (!canUseModAction(interaction.member, interaction.guild, `bulk_${actionType}`)) {
    return safeReply(interaction, ephemeralError(`No permission to use bulk ${actionType}.`));
  }

  const payload = {
    actionType,
    ids: interaction.fields.getTextInputValue('users').split(','),
    reason: interaction.fields.getTextInputValue('reason'),
  };
  if (actionType === 'timeout') payload.durationRaw = interaction.fields.getTextInputValue('duration');
  if (actionType === 'ban') {
    payload.deleteDays = parseDeleteDays(interaction.fields.getTextInputValue('days'));
    if (payload.deleteDays === null) return safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
  }
  return runBulkAction(interaction, payload);
}

async function handleCaseModal(interaction) {
  return submitCaseModal(interaction, { fetchTarget, refreshCasesDashboard });
}

async function handleRemoveWarningModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_remove_warning:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  return submitRemoveWarningRequest(
    interaction,
    getTargetIdFromCustomId(interaction.customId),
    createConfirmation
  );
}

async function handleBanModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_ban:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
    return safeReply(interaction, ephemeralError('No permission to ban users.'));
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const deleteDays = parseDeleteDays(interaction.fields.getTextInputValue('days'));
  if (deleteDays === null) return safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
  return createConfirmation(
    interaction,
    target.id,
    'ban',
    { reason, deleteDays },
    `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`
  );
}

async function handleKickModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_kick:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
    return safeReply(interaction, { content: getModActionDeniedMessage('kick'), flags: 64 });
  }

  const reason = interaction.fields.getTextInputValue('reason').trim();
  return createConfirmation(
    interaction,
    target.id,
    'kick',
    { reason },
    `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`
  );
}

async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
    return safeReply(interaction, { content: getModActionDeniedMessage('warn'), flags: 64 });
  }

  const result = await submitWarning(interaction, target);
  if (result?.ok) await refreshCasesDashboard(interaction, target);
  return true;
}

async function handleTimeoutModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_timeout:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
    return safeReply(interaction, { content: getModActionDeniedMessage('timeout'), flags: 64 });
  }

  const result = await submitTimeout(interaction, target);
  if (result?.ok) await refreshCasesDashboard(interaction, target);
  return true;
}

async function routeButtonsAndSelects(interaction) {
  if (interaction.isUserSelectMenu?.()) return handleUserSelectMenu(interaction);
  if (interaction.isStringSelectMenu?.()) return handleActionSelectMenu(interaction);
  if (!interaction.isButton?.()) return false;

  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;

  const handlers = [
    handleConfirmButtons,
    handleCaseActionButtons,
    handleDashboardNavigation,
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

async function routeModModal(interaction) {
  if (!interaction?.customId?.startsWith('mod_')) return false;
  await syncExpiredWarningsToCases(interaction.guild.id);

  const handlers = [
    handleSelectUserModal,
    handleCaseModal,
    handleBulkModals,
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