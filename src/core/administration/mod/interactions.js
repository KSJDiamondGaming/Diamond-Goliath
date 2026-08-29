'use strict';

const Discord = require('discord.js');
const { safeReply } = require('../../../core/ui/interactionResponse');
const { db, getCaseById, getCasesForUser, updateCaseStatus, recordCaseAudit } = require('./storage');
const {
  fetchTarget,
  ensurePanelAccess,
  ensureActionAccess,
  requireModeratableTarget,
  recordModerationSystemEvent,
} = require('./permissions');
const { buildPunishmentModal, buildBulkModal, submitPunishmentRequest, submitBulkModal, createConfirmation, executePendingAction } = require('./punishments');
const { getWarningCountForUser, syncExpiredWarningsToCases, showWarningModal, showRemoveWarningModal, submitWarningModal, submitRemoveWarningRequest } = require('./warns');
const { openCaseTool, handleCaseAction, submitCaseModal, handleExternalAppealInteraction } = require('./cases');
const { openCaseSearch, handleCaseSearchAction, handleCaseSearchSelect, handleCaseSearchModal } = require('./caseSearch');
const {
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handleSelectUserButton,
  handlePresetInteraction,
  handlePresetModal,
  handleExportInteraction,
  presetIdFromSubmission,
  markPresetUsed,
  getModerationPreset,
} = require('./panel');

const PUNISHMENT_ACTIONS = new Set(['timeout', 'kick', 'ban']);
const BULK_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);
const OPEN_ACTIONS = new Set(['warn', ...PUNISHMENT_ACTIONS]);
const CONFIRM_LOCKS = new Set();
function isModCustomId(customId) { const id = String(customId || ''); return id.startsWith('mod_') || id.startsWith('mod:'); }
function isExternalAppealCustomId(customId) { const id = String(customId || ''); return id === 'mod_appeal_lookup' || id === 'mod_appeal_lookup_submit' || id.startsWith('mod_appeal_external:') || id.startsWith('mod_appeal_external_submit:'); }
function getTargetIdFromCustomId(customId) { return String(customId || '').split(':')[1] || 'none'; }
function getPrefixedAction(customId, prefix, allowedActions) { const id = String(customId || '').split(':')[0]; if (!id.startsWith(prefix)) return null; const action = id.slice(prefix.length); return allowedActions.has(action) ? action : null; }
function getPunishmentSubmitAction(customId) { return getPrefixedAction(customId, 'mod_submit_', PUNISHMENT_ACTIONS); }
function getBulkAction(customId) { return getPrefixedAction(customId, 'mod_submit_bulk_', BULK_ACTIONS) || getPrefixedAction(customId, 'mod_bulk_', BULK_ACTIONS); }
function parseConfirmActionContext(customId) { const parts = String(customId || '').split(':'); const requestedPage = Number(parts[5]); return { token: parts[1] || null, context: { view: parts[2] || 'overview', actionFilter: parts[3] || 'all', statusFilter: parts[4] || 'all', page: Number.isFinite(requestedPage) ? Math.max(0, Math.trunc(requestedPage)) : 0 } }; }
function fieldValue(i, key) { try { return String(i.fields?.getTextInputValue?.(key) || '').trim(); } catch { return ''; } }
function auditFailure(i, event, action, targetId, reason, metadata = {}) { return recordModerationSystemEvent({ interaction: i, event, action, targetId, reason, metadata }); }
function setInputValueIfPresent(input, value, maxLength) {
  const text = String(value || '').slice(0, maxLength);
  return text ? input.setValue(text) : input;
}
function buildSafePresetEditorModal(preset = null, targetId = 'none') {
  const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = Discord;
  const action = String(preset?.action || 'warn').toLowerCase();
  const secondary = action === 'warn' ? String(preset?.warnExpiry || 'never') : action === 'timeout' ? String(preset?.duration || '1h') : '';
  const numeric = action === 'warn' ? String(preset?.strikeWeight || 1) : action === 'ban' ? String(preset?.deleteDays ?? 0) : '';
  const nameInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('name').setLabel('Preset Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80), preset?.name, 80);
  const actionInput = new TextInputBuilder().setCustomId('action').setLabel('Action: warn / timeout / kick / ban').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(action);
  const reasonInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500), preset?.reason, 500);
  const secondaryInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('secondary').setLabel('Warn expiry OR timeout duration').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('warn: 7d/2w/1m/never • timeout: 1h'), secondary, 10);
  const numericInput = setInputValueIfPresent(new TextInputBuilder().setCustomId('numeric').setLabel('Warn weight (1-5) OR ban delete days (0-7)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1), numeric, 1);
  return new ModalBuilder().setCustomId(`mod_preset_save:${preset?.id || 'new'}:${targetId}`).setTitle(preset ? 'Edit Moderation Preset' : 'Create Moderation Preset').addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(actionInput),
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(secondaryInput),
    new ActionRowBuilder().addComponents(numericInput)
  );
}
async function handlePresetEditorButton(i) {
  const id = String(i.customId || '');
  if (id.startsWith('mod_preset_create:')) {
    const [, targetId = 'none'] = id.split(':');
    await i.showModal(buildSafePresetEditorModal(null, targetId));
    return true;
  }
  if (id.startsWith('mod_preset_edit:')) {
    const [, presetId, targetId = 'none'] = id.split(':');
    const preset = getModerationPreset(i.guild.id, presetId);
    if (!preset) return safeReply(i, { content: '❌ Preset not found.', flags: 64 });
    await i.showModal(buildSafePresetEditorModal(preset, targetId));
    return true;
  }
  return false;
}

function scanTimestamp(ms) {
  const value = Number(ms);
  return Number.isFinite(value) && value > 0 ? `<t:${Math.floor(value / 1000)}:F> • <t:${Math.floor(value / 1000)}:R>` : 'Unknown';
}
function normalizeIdentity(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function parseCaseMetadata(modCase) {
  const metadata = modCase?.metadata;
  if (metadata && typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') { try { return JSON.parse(metadata) || {}; } catch { return {}; } }
  return {};
}
function buildSuspectedAccounts(guild, target) {
  const targetUser = target.user;
  const targetUsername = normalizeIdentity(targetUser.username);
  const targetGlobal = normalizeIdentity(targetUser.globalName || target.displayName);
  const candidates = [];
  for (const member of guild.members.cache.values()) {
    if (!member?.user || member.id === target.id || member.user.bot) continue;
    const signals = [];
    let score = 0;
    if (targetUser.avatar && member.user.avatar && targetUser.avatar === member.user.avatar) { score += 45; signals.push('same custom avatar hash'); }
    const candidateUsername = normalizeIdentity(member.user.username);
    const candidateGlobal = normalizeIdentity(member.user.globalName || member.displayName);
    if (targetUsername && candidateUsername === targetUsername) { score += 30; signals.push('same normalized username'); }
    else if (targetUsername && candidateUsername && (candidateUsername.includes(targetUsername) || targetUsername.includes(candidateUsername)) && Math.min(candidateUsername.length, targetUsername.length) >= 5) { score += 12; signals.push('similar username'); }
    if (targetGlobal && candidateGlobal && targetGlobal === candidateGlobal) { score += 20; signals.push('same display/global name'); }
    const createdDelta = Math.abs((member.user.createdTimestamp || 0) - (targetUser.createdTimestamp || 0));
    if (createdDelta && createdDelta <= 86400000) { score += 10; signals.push('accounts created within 24h'); }
    const joinedDelta = Math.abs((member.joinedTimestamp || 0) - (target.joinedTimestamp || 0));
    if (joinedDelta && joinedDelta <= 86400000) { score += 10; signals.push('joined server within 24h'); }
    score = Math.min(95, score);
    if (score >= 35) candidates.push({ member, score, signals });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}
function buildMemberScanPayload(i, target) {
  const cases = getCasesForUser(i.guild.id, target.id) || [];
  const warningCount = getWarningCountForUser(i.guild.id, target.id);
  const activeCases = cases.filter((entry) => String(entry.status || 'active') === 'active').length;
  const bans = cases.filter((entry) => entry.action === 'ban').length;
  const timeouts = cases.filter((entry) => entry.action === 'timeout').length;
  const appeals = cases.reduce((total, entry) => total + (Array.isArray(parseCaseMetadata(entry).appeals) ? parseCaseMetadata(entry).appeals.length : 0), 0);
  const evidence = cases.reduce((total, entry) => total + (Array.isArray(parseCaseMetadata(entry).evidence) ? parseCaseMetadata(entry).evidence.filter((item) => !item?.removedAt).length : 0), 0);
  const roles = [...target.roles.cache.values()].filter((role) => role.id !== i.guild.id).sort((a, b) => b.position - a.position);
  const keyPermissions = target.permissions.toArray().filter((name) => ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages', 'ModerateMembers', 'KickMembers', 'BanMembers'].includes(name));
  const flags = target.user.flags?.toArray?.() || [];
  const suspects = buildSuspectedAccounts(i.guild, target);
  const suspectText = suspects.length
    ? suspects.map(({ member, score, signals }) => `${score >= 70 ? '🔴 **STRONG MATCH**' : '🟠 **POSSIBLE MATCH**'} — ${member.user} • **${score}%**\n${signals.map((signal) => `• ${signal}`).join('\n')}`).join('\n\n')
    : '⚪ **NO LINK FOUND** — No evidence-based suspected account match in the current guild cache.';
  const recent = cases.slice(0, 5).map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • ${entry.reason || 'No reason'}`).join('\n') || 'No recorded moderation cases.';
  const scanId = `scan_${Date.now().toString(36)}_${target.id.slice(-6)}`;
  const embed = new Discord.EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🔎 Goliath Member Scan • ${target.user.tag}`)
    .setDescription([
      `**Scan ID:** \`${scanId}\``,
      `**Target:** ${target.user} (\`${target.id}\`)`,
      '',
      'This report separates confirmed Discord/Goliath data from heuristic suspected-account matches. A suspected match is not proof of account ownership.',
    ].join('\n'))
    .addFields(
      { name: '🪪 Identity', value: [`Username: \`${target.user.username}\``, `Global name: ${target.user.globalName || 'None'}`, `Server display: ${target.displayName || target.user.username}`, `Bot: ${target.user.bot ? 'Yes' : 'No'}`, `Account created: ${scanTimestamp(target.user.createdTimestamp)}`].join('\n'), inline: false },
      { name: '🏠 Guild Membership', value: [`Joined: ${scanTimestamp(target.joinedTimestamp)}`, `Boosting since: ${scanTimestamp(target.premiumSinceTimestamp)}`, `Pending screening: ${target.pending ? 'Yes' : 'No'}`, `Timeout until: ${target.communicationDisabledUntilTimestamp ? scanTimestamp(target.communicationDisabledUntilTimestamp) : 'None'}`].join('\n'), inline: false },
      { name: `🎭 Roles (${roles.length})`, value: (roles.slice(0, 15).map((role) => `${role}`).join(', ') || 'None').slice(0, 1024), inline: false },
      { name: '🔐 Key Permissions', value: keyPermissions.length ? keyPermissions.map((name) => `\`${name}\``).join(' • ') : 'No elevated Discord permissions detected.', inline: false },
      { name: '🚩 Account Flags', value: flags.length ? flags.join(', ') : 'None exposed by Discord.', inline: false },
      { name: '⚖️ Moderation Intelligence', value: [`Warnings: **${warningCount}**`, `Cases: **${cases.length}** • Active: **${activeCases}**`, `Timeout cases: **${timeouts}** • Ban cases: **${bans}**`, `Appeals: **${appeals}** • Active evidence refs: **${evidence}**`].join('\n'), inline: false },
      { name: '🕘 Recent Case History', value: recent.slice(0, 1024), inline: false },
      { name: '🧬 Suspected Accounts', value: suspectText.slice(0, 1024), inline: false },
      { name: '🔗 Confirmed Linked Accounts', value: 'No confirmed Goliath identity-link provider is currently connected to this scan. This section will only show verified links when Goliath has a legitimate stored verification/OAuth relationship.', inline: false },
      { name: '📡 Data Sources', value: 'Discord API • current guild member cache • Goliath moderation cases • warnings • case metadata • appeals • evidence references • heuristic guild correlation', inline: false },
    )
    .setFooter({ text: `Scanned by ${i.user?.tag || i.user?.username || i.user?.id || 'Unknown staff'} • evidence-based intelligence only` })
    .setTimestamp();
  const controls = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId(`mod_member_scan:${target.id}`).setLabel('Rescan').setEmoji('🔄').setStyle(Discord.ButtonStyle.Primary),
    new Discord.ButtonBuilder().setCustomId(`mod_case_detail:${target.id}`).setLabel('Case Detail').setEmoji('📁').setStyle(Discord.ButtonStyle.Secondary),
    new Discord.ButtonBuilder().setCustomId(`mod_dashboard:${target.id}:cases`).setLabel('Cases').setEmoji('⚖️').setStyle(Discord.ButtonStyle.Secondary),
  );
  return { scanId, cases, suspects, embed, components: [controls] };
}
async function runMemberScan(i, targetId) {
  const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to run a member intelligence scan.');
  if (!allowed) return true;
  const target = await fetchTarget(i.guild, targetId);
  if (!target) return safeReply(i, { content: '❌ Could not find that member in this server.', flags: 64 });
  const report = buildMemberScanPayload(i, target);
  recordModerationSystemEvent({
    interaction: i,
    event: 'moderation.member_scan.completed',
    action: 'member_scan',
    targetId: target.id,
    after: { scanId: report.scanId, caseCount: report.cases.length, suspectedMatches: report.suspects.map((entry) => ({ userId: entry.member.id, score: entry.score, signals: entry.signals })) },
    metadata: { dataSources: ['discord_api', 'guild_cache', 'moderation_cases', 'warnings', 'case_metadata', 'appeals', 'evidence', 'heuristic_guild_correlation'] },
  });
  return safeReply(i, { embeds: [report.embed], components: report.components, flags: 64 });
}
async function handleMemberScanSelect(i) {
  if (i.customId !== 'mod_scan_user_select') return false;
  const targetId = i.values?.[0];
  if (!targetId) return safeReply(i, { content: '❌ No member selected.', flags: 64 });
  return runMemberScan(i, targetId);
}
async function handleMemberScanButton(i) {
  const id = String(i.customId || '');
  if (id === 'mod_select_user' || id === 'mod_member_scan') {
    const allowed = await ensureActionAccess(i, 'view_case_detail', '❌ You do not have permission to run a member intelligence scan.');
    if (!allowed) return true;
    const select = new Discord.UserSelectMenuBuilder().setCustomId('mod_scan_user_select').setPlaceholder('🔎 Select a member to scan').setMinValues(1).setMaxValues(1);
    return safeReply(i, { content: '🔎 **Goliath Member Scan** — select a server member to run a full intelligence report.', components: [new Discord.ActionRowBuilder().addComponents(select)], flags: 64 });
  }
  if (id.startsWith('mod_member_scan:')) return runMemberScan(i, id.split(':')[1]);
  return false;
}

async function showPunishmentModal(i, action, targetId) { if (!PUNISHMENT_ACTIONS.has(action)) return false; const target = await requireModeratableTarget(i, targetId, action); if (!target) return true; await i.showModal(buildPunishmentModal(action, target.id)); return true; }
async function requestRemoveTimeout(i, targetId) { const target = await requireModeratableTarget(i, targetId, 'remove_timeout'); if (!target) return true; return createConfirmation(i, target.id, 'remove-timeout', {}, `✅ Remove timeout from **${target.user.tag}**?`); }
async function routeActionRequest(i, action, targetId) { if (action === 'warn') return showWarningModal(i, targetId); if (action === 'remove-warning') return showRemoveWarningModal(i, targetId); if (action === 'remove-timeout') return requestRemoveTimeout(i, targetId); if (PUNISHMENT_ACTIONS.has(action)) return showPunishmentModal(i, action, targetId); return false; }
async function handleActionSelectMenu(i) { if (!i.customId.startsWith('mod_action_select:')) return false; return routeActionRequest(i, i.values[0], getTargetIdFromCustomId(i.customId)); }
async function handleOpenActionButton(i) { const action = getPrefixedAction(i.customId, 'mod_open_', OPEN_ACTIONS); if (!action) return false; return routeActionRequest(i, action, getTargetIdFromCustomId(i.customId)); }
async function handleCaseToolButton(i) { const caseResult = await openCaseTool(i); if (caseResult) return caseResult; const searchResult = await handleCaseSearchAction(i); if (searchResult) return searchResult; const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id); if (id.startsWith('mod_remove_warning:')) return routeActionRequest(i, 'remove-warning', targetId); if (id.startsWith('mod_remove_timeout:')) return routeActionRequest(i, 'remove-timeout', targetId); return false; }
async function handleBulkButton(i) {
  if (!String(i.customId || '').startsWith('mod_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  await i.showModal(buildBulkModal(action)); return true;
}
async function handleConfirmButton(i) {
  if (!i.customId.startsWith('mod_confirm_action:')) return false;
  const { token, context } = parseConfirmActionContext(i.customId);
  if (!token) return false;
  const lockKey = `${i.guild?.id || 'none'}:${token}`;
  if (CONFIRM_LOCKS.has(lockKey)) {
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.duplicate_blocked', metadata: { tokenPresent: true } });
    return safeReply(i, { content: '⏳ That moderation action is already being processed.', flags: 64 });
  }
  CONFIRM_LOCKS.add(lockKey);
  try {
    const result = await executePendingAction(Discord, i, token, context);
    recordModerationSystemEvent({ interaction: i, event: 'moderation.confirmation.processed', metadata: { tokenPresent: true, handled: Boolean(result) } });
    return result;
  } finally {
    CONFIRM_LOCKS.delete(lockKey);
  }
}
async function handleCancelButton(i) {
  if (i.customId !== 'mod_cancel_action') return false;
  let removed = 0;
  if (i.guild?.id && i.user?.id) removed = db.prepare('DELETE FROM pending_actions WHERE guild_id = ? AND moderator_id = ?').run(String(i.guild.id), String(i.user.id)).changes;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.action.cancelled', metadata: { pendingActionsRemoved: removed } });
  if (i.message && typeof i.update === 'function') { await i.update({ content: '❌ Cancelled.', embeds: [], components: [] }); return true; }
  return safeReply(i, { content: '❌ Cancelled.', flags: 64 });
}
async function handleBulkModal(i) {
  if (!String(i.customId || '').startsWith('mod_submit_bulk_')) return false;
  const action = getBulkAction(i.customId); if (!action) return false;
  const allowed = await ensureActionAccess(i, `bulk_${action}`, `❌ No permission to use bulk ${action}.`); if (!allowed) return true;
  recordModerationSystemEvent({ interaction: i, event: 'moderation.bulk.requested', action, metadata: { operation: fieldValue(i, 'operation') || action } });
  return submitBulkModal(i, action);
}
function trackPresetSubmission(i) { const presetId = presetIdFromSubmission(i.customId); if (presetId && i.guild) markPresetUsed(i.guild, presetId, i.user?.id || null); }
async function handleActionModal(i) {
  const id = String(i.customId || ''); const targetId = getTargetIdFromCustomId(id);
  if (id.startsWith('mod_submit_warn:')) {
    const result = await submitWarningModal(i, targetId, refreshCasesDashboard);
    if (result?.ok) trackPresetSubmission(i);
    else auditFailure(i, 'moderation.action.failed', 'warn', targetId, result?.error?.message || result?.error || 'Warning submission failed.');
    return result || true;
  }
  if (id.startsWith('mod_submit_remove_warning:')) return submitRemoveWarningRequest(i, targetId, createConfirmation);
  const action = getPunishmentSubmitAction(id); if (!action) return false;
  const target = await requireModeratableTarget(i, targetId, action); if (!target) return true;
  const result = await submitPunishmentRequest(i, target, action);
  if (result?.ok) trackPresetSubmission(i);
  else auditFailure(i, 'moderation.action.failed', action, targetId, result?.error?.message || result?.error || `${action} submission failed.`);
  if (action === 'timeout' && result?.ok) await refreshCasesDashboard(i, target);
  return true;
}
async function hardenAppealDecisionResult(i, result) {
  const match = String(i.customId || '').match(/^mod_submit_case_appeal_decision:(\d+):([^:]+):(approved|denied)$/);
  if (!match || match[3] !== 'approved' || !i.guild?.id) return result;
  const caseId = Number(match[1]);
  const appealId = match[2];
  let modCase = getCaseById(i.guild.id, caseId);
  if (!modCase) return result;
  const appeal = Array.isArray(modCase.metadata?.appeals) ? modCase.metadata.appeals.find((entry) => String(entry?.id) === appealId) : null;
  const remedy = appeal?.remedy || null;
  if (remedy?.ok === false && modCase.status === 'reversed') {
    modCase = updateCaseStatus(i.guild.id, caseId, 'active', i.user?.id || null) || modCase;
    recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.appeal.remedy.status_restored', before: 'reversed', after: 'active', metadata: { appealId, remedyAction: remedy.action || null, reason: remedy.detail || 'Approved appeal remedy failed.' } });
    recordModerationSystemEvent({ interaction: i, event: 'moderation.appeal.remedy.failed', action: remedy.action || modCase.action, targetId: modCase.userId, reason: remedy.detail || 'Approved appeal remedy failed.', metadata: { caseId, appealId, caseStatusRestored: true } });
  }
  if (modCase.action === 'warn' && remedy?.ok === true) {
    const existing = db.prepare('SELECT audit_id FROM case_audit WHERE guild_id = ? AND case_id = ? AND event = ? LIMIT 1').get(String(i.guild.id), caseId, 'case.strike.removed');
    if (!existing) {
      const strikeWeight = Math.max(1, Math.min(5, Number(modCase.metadata?.strikeWeight) || 1));
      recordCaseAudit({ guildId: i.guild.id, caseId, actorId: i.user?.id || null, event: 'case.strike.removed', before: strikeWeight, after: 0, metadata: { strikeWeight, appealId, appealRemedy: true } });
    }
  }
  return result;
}
async function handleCaseModal(i) {
  const result = await submitCaseModal(i, { fetchTarget, refreshCasesDashboard });
  return hardenAppealDecisionResult(i, result);
}
async function routeHandlers(i, handlers) { for (const handler of handlers) { const result = await handler(i); if (result) return result; } return false; }
async function routeButtonsAndSelects(i) {
  const denied = ensurePanelAccess(i); if (denied) return denied;
  if (i.isUserSelectMenu?.()) {
    const scan = await handleMemberScanSelect(i);
    if (scan) return scan;
    return handleUserSelectMenu(i);
  }
  if (i.isStringSelectMenu?.()) return routeHandlers(i, [handlePresetInteraction, handleCaseSearchSelect, handleActionSelectMenu]);
  if (!i.isButton?.()) return false;
  return routeHandlers(i, [handleExportInteraction, handlePresetEditorButton, handlePresetInteraction, handleConfirmButton, value => handleCaseAction(value, { fetchTarget, createConfirmation }), handleDashboardNavigation, handleCancelButton, handleMemberScanButton, handleSelectUserButton, handleBulkButton, handleOpenActionButton, handleCaseToolButton]);
}
async function routeModModal(i) {
  if (!i?.customId?.startsWith('mod_')) return false;
  const denied = ensurePanelAccess(i); if (denied) return denied;
  await syncExpiredWarningsToCases(i.guild.id);
  if (String(i.customId).startsWith('mod_export_submit:')) {
    const result = await handleExportInteraction(i);
    if (result) {
      recordModerationSystemEvent({ interaction: i, event: 'moderation.export.requested', action: 'export_cases', metadata: {
        scope: fieldValue(i, 'scope'), reference: fieldValue(i, 'reference') || null, format: fieldValue(i, 'format'), include: fieldValue(i, 'include'), filters: fieldValue(i, 'filters').slice(0, 500),
      } });
      return result;
    }
  }
  return routeHandlers(i, [handleExportInteraction, handlePresetModal, handleCaseSearchModal, handleCaseModal, handleBulkModal, handleActionModal]);
}
async function handleModInteraction(i) {
  if (!i?.customId || !isModCustomId(i.customId)) return false;
  if (i.customId.startsWith('nav|')) return false;
  try {
    if (isExternalAppealCustomId(i.customId)) return await handleExternalAppealInteraction(i);
    if (i.isModalSubmit?.()) return await routeModModal(i);
    const handled = await routeButtonsAndSelects(i);
    if (!handled) recordModerationSystemEvent({ interaction: i, event: 'moderation.interaction.unhandled', metadata: { interactionType: i.componentType || null } });
    return handled;
  } catch (error) {
    console.error('❌ Moderation interaction failed:', error);
    auditFailure(i, 'moderation.interaction.failed', null, getTargetIdFromCustomId(i.customId), error?.message || error, { stack: String(error?.stack || '').slice(0, 1500) });
    await safeReply(i, { content: '❌ That moderation action failed safely. No further action was taken.', flags: 64 }).catch(() => null);
    return true;
  }
}
module.exports = { handleModInteraction };
