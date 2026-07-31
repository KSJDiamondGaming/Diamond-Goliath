'use strict';

const Discord = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  parseDuration,
  isValidTimeoutDuration,
  parseDeleteDays,
  fetchTarget,
  createPendingAction,
  executePendingAction,
  runBulkAction,
} = require('./punishments');
const {
  parseWarningExpiry,
  syncExpiredWarningsToCases,
  createWarning,
  getWarningByCaseId,
  getWarningContext,
  runWarningEscalation,
} = require('./warns');
const {
  getStatusLabel,
  buildCaseDetailButtons,
} = require('./cases');
const {
  createCase,
  getCaseById,
  updateCaseReason,
  updateCaseNote,
  clearCaseNote,
} = require('../../../core/logging/cases/caseStore');
const { sendModLog } = require('../../../core/logging/modlogs/moderationActionLog');

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
  return ['mod_confirm_action', token, value.view, value.actionFilter, value.statusFilter, value.page].join(':');
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

function buildCaseIdModal(customId, title, label = 'Case ID') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('case_id')
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1')
        .setRequired(true)
        .setMaxLength(10)
    ));
}

function buildReasonModal(customId, title, includeDays = false, includeDuration = false, includeWarnExpiry = false) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const rows = [];

  if (includeDays) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('days')
        .setLabel('Delete message days (0-7)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('0')
        .setRequired(true)
        .setMaxLength(1)
    ));
  }

  if (includeDuration) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration (10m, 1h, 1d)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1h')
        .setRequired(true)
        .setMaxLength(10)
    ));
  }

  if (includeWarnExpiry) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('warn_expiry')
        .setLabel('Warn expiry (7d, 2w, 1m, or never)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('never')
        .setRequired(false)
        .setMaxLength(10)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the moderation reason')
      .setRequired(true)
      .setMaxLength(500)
  ));

  return modal.addComponents(...rows);
}

function buildBulkModal(type) {
  const titleMap = { warn: 'Bulk Warn', timeout: 'Bulk Timeout', kick: 'Bulk Kick', ban: 'Bulk Ban' };
  const modal = new ModalBuilder()
    .setCustomId(`mod_submit_bulk_${type}`)
    .setTitle(titleMap[type] || 'Bulk Moderation');
  const rows = [new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('users')
      .setLabel('User IDs (comma separated)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('123456789012345678, 987654321098765432')
      .setRequired(true)
  )];

  if (type === 'timeout') {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration (10m, 1h, 1d)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1h')
        .setRequired(true)
    ));
  }

  if (type === 'ban') {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('days')
        .setLabel('Delete message days (0-7)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('0')
        .setRequired(true)
        .setMaxLength(1)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter the moderation reason')
      .setRequired(true)
      .setMaxLength(500)
  ));

  return modal.addComponents(...rows);
}

function buildEditCaseModal(customId) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Edit Case')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('case_id')
          .setLabel('Case ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('New Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter the updated moderation reason')
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

function buildCaseNoteModal(customId, existingNote = '') {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existingNote ? 'Edit Case Note' : 'Add Case Note')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Staff Note')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add internal staff-only context for this case')
        .setRequired(false)
        .setMaxLength(1000)
        .setValue(String(existingNote || '').slice(0, 1000))
    ));
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
  const valuesFor = (member) => [member.user?.username, member.user?.tag, member.displayName, member.nickname]
    .map((value) => String(value || '').trim().toLowerCase());
  const exact = guild.members.cache.find((member) => valuesFor(member).includes(needle));
  if (exact) return exact;
  const partial = guild.members.cache.find((member) => valuesFor(member).some((value) => value && value.includes(needle)));
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
  const target = targetId && targetId !== 'none' ? await fetchTarget(interaction.guild, targetId) : null;
  if (targetId && targetId !== 'none' && !target) {
    return safeReply(interaction, ephemeralError('Could not find the selected user.'));
  }

  const { buildDashboardPayload } = require('./modPanel');
  const payload = await buildDashboardPayload(Discord, interaction, target, view, context);
  await interaction.update(payload);
  return true;
}

async function createConfirmation(interaction, targetId, type, payload, message, context = DEFAULT_DASHBOARD_CONTEXT) {
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
  mod_open_warn: { permission: 'warn', modal: (id) => buildReasonModal(`mod_submit_warn:${id}`, 'Warn User', false, false, true) },
  mod_open_timeout: { permission: 'timeout', modal: (id) => buildReasonModal(`mod_submit_timeout:${id}`, 'Timeout User', false, true) },
  mod_open_kick: { permission: 'kick', modal: (id) => buildReasonModal(`mod_submit_kick:${id}`, 'Kick User') },
  mod_open_ban: { permission: 'ban', modal: (id) => buildReasonModal(`mod_submit_ban:${id}`, 'Ban User', true) },
});

const ACTION_SELECT_MODALS = Object.freeze({
  warn: (id) => buildReasonModal(`mod_submit_warn:${id}`, 'Warn User', false, false, true),
  timeout: (id) => buildReasonModal(`mod_submit_timeout:${id}`, 'Timeout User', false, true),
  kick: (id) => buildReasonModal(`mod_submit_kick:${id}`, 'Kick User'),
  ban: (id) => buildReasonModal(`mod_submit_ban:${id}`, 'Ban User', true),
  'remove-warning': (id) => buildCaseIdModal(`mod_submit_remove_warning:${id}`, 'Remove Warning', 'Warning Case ID'),
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
    return createConfirmation(interaction, targetId, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`);
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
  const id = String(interaction.customId || '');
  const targetId = getTargetIdFromCustomId(id);

  if (id.startsWith('mod_case_detail:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view case details.'));
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildCaseIdModal(`mod_submit_case_detail:${targetId}`, 'View Case Detail'));
    return true;
  }

  if (id.startsWith('mod_edit_case:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to edit cases.'));
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildEditCaseModal(`mod_submit_edit_case:${targetId}`));
    return true;
  }

  if (id.startsWith('mod_remove_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) return safeReply(interaction, ephemeralError('No permission to remove warnings.'));
    if (targetId === 'none') return safeReply(interaction, ephemeralError('No user selected.'));
    await interaction.showModal(buildCaseIdModal(`mod_submit_remove_warning:${targetId}`, 'Remove Warning', 'Warning Case ID'));
    return true;
  }

  if (id.startsWith('mod_remove_timeout:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_timeout')) return safeReply(interaction, ephemeralError('No permission to remove timeouts.'));
    const target = await requireSelectedTarget(interaction, targetId);
    if (!target) return true;
    const error = checkHierarchy(interaction, target);
    if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
    return createConfirmation(interaction, targetId, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`);
  }

  return false;
}

async function handleCaseActionButtons(interaction) {
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const id = String(interaction.customId || '');

  if (id.startsWith('mod_case_note:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) return safeReply(interaction, ephemeralError('No permission to add case notes.'));
    const [, caseIdRaw] = id.split(':');
    if (!/^\d+$/.test(caseIdRaw)) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
    await interaction.showModal(buildCaseNoteModal(`mod_submit_case_note:${modCase.caseId}`, modCase.note || ''));
    return true;
  }

  if (id.startsWith('mod_case_reverse_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) return safeReply(interaction, ephemeralError('No permission to reverse warnings.'));
    const [, caseIdRaw] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase || modCase.action !== 'warn') return safeReply(interaction, ephemeralError('Warning case could not be found.'));
    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) return safeReply(interaction, ephemeralError('User not found for that case.'));
    return createConfirmation(interaction, target.id, 'remove-warning', { caseId: modCase.caseId }, `⚠️ Reverse warning from **Case #${modCase.caseId}**?`);
  }

  if (id.startsWith('mod_case_reverse_timeout:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_timeout')) return safeReply(interaction, ephemeralError('No permission to reverse timeouts.'));
    const [, caseIdRaw] = id.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase || modCase.action !== 'timeout') return safeReply(interaction, ephemeralError('That timeout case could not be found.'));
    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) return safeReply(interaction, ephemeralError('User not found for that case.'));
    return createConfirmation(interaction, target.id, 'remove-timeout', { sourceCaseId: modCase.caseId }, `⏳ Reverse timeout from **Case #${modCase.caseId}**?`);
  }

  return false;
}

async function handleConfirmButtons(interaction) {
  if (!interaction.customId.startsWith('mod_confirm_action:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const { token, context } = parseConfirmActionContext(interaction.customId);
  return executePendingAction(Discord, interaction, token, context);
}

function getCaseIdFromModal(interaction, field = 'case_id') {
  const raw = interaction.fields.getTextInputValue(field).trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

async function refreshCasesDashboard(interaction, target) {
  if (!target) return false;
  const { refreshDashboard } = require('./modPanel');
  await refreshDashboard(Discord, interaction, target, DEFAULT_DASHBOARD_CONTEXT);
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
      { name: 'Created', value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`, inline: true },
      { name: 'Updated', value: modCase.updatedAt ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>` : 'Never', inline: true }
    )
    .setTimestamp();

  if (modCase.relatedCaseId) embed.addFields({ name: 'Related Case', value: `#${modCase.relatedCaseId}`, inline: true });
  if (modCase.note && String(modCase.note).trim()) embed.addFields({ name: 'Staff Note', value: String(modCase.note).slice(0, 1024), inline: false });
  if (modCase.metadata && Object.keys(modCase.metadata).length) embed.addFields({ name: 'Metadata', value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2).slice(0, 900)}\n\`\`\``, inline: false });
  return embed;
}

async function handleSelectUserModal(interaction) {
  if (interaction.customId !== 'mod_select_user_modal') return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const target = await findMemberByQuery(interaction.guild, interaction.fields.getTextInputValue('target_user_query'));
  if (!target) return safeReply(interaction, ephemeralError('User not found by that ID, username, tag, or display name.'));
  const { buildDashboardPayload } = require('./modPanel');
  return safeReply(interaction, { ...(await buildDashboardPayload(Discord, interaction, target, 'overview')), flags: 64 });
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
  if (!canUseModAction(interaction.member, interaction.guild, `bulk_${actionType}`)) return safeReply(interaction, ephemeralError(`No permission to use bulk ${actionType}.`));

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

async function handleCaseDetailModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_detail:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);
  if (!caseId) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) return safeReply(interaction, ephemeralError('No permission to view case details.'));
  const modCase = getCaseById(interaction.guild.id, caseId);
  if (!modCase) return safeReply(interaction, ephemeralError('Case not found.'));
  if (targetId !== 'none' && modCase.userId !== targetId) return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
  return safeReply(interaction, { embeds: [buildCaseDetailEmbed(modCase)], components: buildCaseDetailButtons(modCase), flags: 64 });
}

async function handleEditCaseModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_edit_case:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);
  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!caseId) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) return safeReply(interaction, ephemeralError('No permission to edit cases.'));
  const existing = getCaseById(interaction.guild.id, caseId);
  if (!existing) return safeReply(interaction, ephemeralError('Case not found.'));
  if (targetId !== 'none' && existing.userId !== targetId) return safeReply(interaction, ephemeralError('That case does not belong to the currently selected user.'));
  const updated = updateCaseReason(interaction.guild.id, caseId, reason);
  if (!updated) return safeReply(interaction, ephemeralError('Failed to update case.'));
  const target = await fetchTarget(interaction.guild, updated.userId);
  await safeReply(interaction, { content: `✏️ Updated reason for **Case #${updated.caseId}**.`, flags: 64 });
  await refreshCasesDashboard(interaction, target);
  return true;
}

async function handleCaseNoteModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_case_note:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const [, caseIdRaw] = interaction.customId.split(':');
  if (!/^\d+$/.test(caseIdRaw)) return safeReply(interaction, ephemeralError('Case ID must be a number.'));
  if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) return safeReply(interaction, ephemeralError('No permission to add case notes.'));
  const caseId = Number(caseIdRaw);
  const existing = getCaseById(interaction.guild.id, caseId);
  if (!existing) return safeReply(interaction, ephemeralError('Case not found.'));
  const note = interaction.fields.getTextInputValue('note').trim();
  const updated = note ? updateCaseNote(interaction.guild.id, caseId, note) : clearCaseNote(interaction.guild.id, caseId);
  if (!updated) return safeReply(interaction, ephemeralError('Failed to update case note.'));
  const target = await fetchTarget(interaction.guild, updated.userId);
  await safeReply(interaction, { content: note ? `📝 Updated note for **Case #${updated.caseId}**.` : `🗑️ Cleared note for **Case #${updated.caseId}**.`, flags: 64 });
  await refreshCasesDashboard(interaction, target);
  return true;
}

async function handleRemoveWarningModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_remove_warning:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const targetId = getTargetIdFromCustomId(interaction.customId);
  const caseId = getCaseIdFromModal(interaction);
  if (!caseId) return safeReply(interaction, ephemeralError('Warning case ID must be a number.'));
  if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) return safeReply(interaction, { content: getModActionDeniedMessage('remove_warning'), flags: 64 });
  const warning = getWarningByCaseId(interaction.guild.id, caseId);
  if (!warning) return safeReply(interaction, ephemeralError('Warning not found for that case ID.'));
  if (targetId !== 'none' && warning.userId !== targetId) return safeReply(interaction, ephemeralError('User not found for that case.'));
  return createConfirmation(interaction, warning.userId, 'remove-warning', { caseId }, `Remove warning linked to **Case #${caseId}**?`);
}

async function handleBanModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_ban:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'ban')) return safeReply(interaction, ephemeralError('No permission to ban users.'));
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const deleteDays = parseDeleteDays(interaction.fields.getTextInputValue('days'));
  if (deleteDays === null) return safeReply(interaction, ephemeralError('Delete message days must be 0-7.'));
  return createConfirmation(interaction, target.id, 'ban', { reason, deleteDays }, `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`);
}

async function handleKickModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_kick:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'kick')) return safeReply(interaction, { content: getModActionDeniedMessage('kick'), flags: 64 });
  const reason = interaction.fields.getTextInputValue('reason').trim();
  return createConfirmation(interaction, target.id, 'kick', { reason }, `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`);
}

async function handleWarnModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_warn:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'warn')) return safeReply(interaction, { content: getModActionDeniedMessage('warn'), flags: 64 });

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const expiryRaw = interaction.fields.getTextInputValue('warn_expiry') || 'never';
  const expiresAt = parseWarningExpiry(expiryRaw);
  if (expiryRaw.trim().toLowerCase() !== 'never' && !expiresAt) return safeReply(interaction, ephemeralError('Invalid warning expiry. Use `7d`, `2w`, `1m`, or `never`.'));

  try {
    const modCase = createCase({
      guildId: interaction.guild.id,
      userId: target.id,
      moderatorId: interaction.user.id,
      action: 'warn',
      reason,
      metadata: { expiresAt },
    });
    createWarning({ guildId: interaction.guild.id, userId: target.id, moderatorId: interaction.user.id, reason, caseId: modCase.caseId, expiresAt });
    const warningContext = await getWarningContext({ guildId: interaction.guild.id, userId: target.id, reason });
    const escalatedCase = await runWarningEscalation({ guild: interaction.guild, member: target, moderator: interaction.user, reason });
    await sendModLog({
      guild: interaction.guild,
      target,
      moderator: interaction.user,
      action: 'Warn',
      reason,
      caseId: modCase.caseId,
      metadata: {
        expiresAt,
        repeatPattern: Boolean(warningContext.repeatInfo.isRepeatPattern),
        repeatCount: warningContext.repeatInfo.repeatCount || 0,
        escalatedAction: escalatedCase?.action || null,
        escalatedCaseId: escalatedCase?.caseId || null,
      },
    });

    const extra = [];
    if (warningContext.repeatInfo.isRepeatPattern) extra.push(`🔁 Repeat reason detected (${warningContext.repeatInfo.repeatCount} matching warnings)`);
    if (escalatedCase) extra.push(`⚡ Auto escalation triggered: **${escalatedCase.action}** (Case #${escalatedCase.caseId})`);
    await safeReply(interaction, { content: [`⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`, ...extra].join('\n'), flags: 64 });
    await refreshCasesDashboard(interaction, target);
    return true;
  } catch (error) {
    console.error('❌ Warn error:', error);
    return safeReply(interaction, ephemeralError('Failed to warn user.'));
  }
}

async function handleTimeoutModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_timeout:')) return false;
  const denied = ensurePanelAccess(interaction);
  if (denied) return denied;
  const target = await fetchTarget(interaction.guild, getTargetIdFromCustomId(interaction.customId));
  const error = checkHierarchy(interaction, target);
  if (error) return safeReply(interaction, ephemeralError(cleanError(error)));
  if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) return safeReply(interaction, { content: getModActionDeniedMessage('timeout'), flags: 64 });

  const durationRaw = interaction.fields.getTextInputValue('duration').trim();
  const reason = interaction.fields.getTextInputValue('reason').trim();
  const durationMs = parseDuration(durationRaw);
  if (!durationMs) return safeReply(interaction, ephemeralError('Invalid duration. Use `10m`, `1h`, or `1d`.'));
  if (!isValidTimeoutDuration(durationMs)) return safeReply(interaction, ephemeralError('Timeout cannot exceed 28 days.'));

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
    await safeReply(interaction, { content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`, flags: 64 });
    await refreshCasesDashboard(interaction, target);
    return true;
  } catch (error) {
    console.error('❌ Timeout error:', error);
    return safeReply(interaction, ephemeralError('Failed to timeout user.'));
  }
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
