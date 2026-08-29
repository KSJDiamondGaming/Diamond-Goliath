'use strict';

const crypto = require('node:crypto');
const Discord = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = Discord;

const guildManager = require('../../guild/guildManager');
const { safeReply, ephemeralError } = require('../../../core/ui/interactionResponse');
const {
  COLORS,
  EMOJIS,
  baseEmbed,
  createEmbed,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
} = require('../../../core/ui/embeds');
const {
  db,
  getAllCases,
  getCaseCountForUser,
  getCasesForUser,
  getFilteredCases,
} = require('./storage');
const {
  formatCaseSummary,
  getStatusLabel,
  buildCaseFilterButtons,
  buildCasesPageButtons,
  getCaseAppeals,
} = require('./cases');
const { getWarningCountForUser, syncExpiredWarningsToCases } = require('./warns');
const { canUseModAction, getStaffDisplay, hasModPermission, fetchTarget } = require('./permissions');

const DEFAULT_VIEW = 'overview';
const CASES_PER_PAGE = 5;
const ALLOWED_VIEWS = new Set(['overview', 'actions', 'cases', 'tools', 'analytics']);
const ANALYTICS_WINDOWS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });
const ANALYTICS_WINDOW_LABELS = Object.freeze({ '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', all: 'All Time' });
const DEFAULT_CASES_CONTEXT = Object.freeze({ view: 'cases', actionFilter: 'all', statusFilter: 'all', page: 0 });
const DEFAULT_ANALYTICS_CONTEXT = Object.freeze({ view: 'analytics', analyticsWindow: '30d', analyticsMode: 'overview', analyticsModeratorId: null });
const PRESET_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);
const MAX_PRESETS = 20;

function canOpenModPanel(interaction) { return Boolean(interaction?.guild && interaction?.member && hasModPermission(interaction.member)); }
function noAccessPayload() { return { content: '❌ You do not have permission to use the moderation panel.', flags: 64 }; }
function normalizeAnalyticsWindow(value) { return Object.prototype.hasOwnProperty.call(ANALYTICS_WINDOWS, value) ? value : '30d'; }
function normalizeDashboardContext(context = {}) {
  return {
    view: ALLOWED_VIEWS.has(context.view) ? context.view : DEFAULT_VIEW,
    actionFilter: context.actionFilter || 'all',
    statusFilter: context.statusFilter || 'all',
    page: Number(context.page) || 0,
    analyticsWindow: normalizeAnalyticsWindow(context.analyticsWindow),
    analyticsMode: context.analyticsMode === 'moderator' ? 'moderator' : 'overview',
    analyticsModeratorId: context.analyticsModeratorId ? String(context.analyticsModeratorId) : null,
  };
}
function getEmoji(key, fallback) { return EMOJIS?.[key] || fallback; }
function getCaseTime(modCase) { const value = new Date(modCase?.createdAt || modCase?.created_at || 0).getTime(); return Number.isFinite(value) ? value : 0; }
function getAuditTime(entry) { const value = new Date(entry?.created_at || entry?.createdAt || 0).getTime(); return Number.isFinite(value) ? value : 0; }
function percentage(part, total) { return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%'; }
function increment(map, key, amount = 1) { if (key) map[key] = (map[key] || 0) + amount; }
function topEntries(map, limit = 5) { return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit); }
function formatActionBreakdown(counts = {}) {
  const order = ['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout'];
  const rows = order.filter((key) => counts[key]).map((key) => `${key}: **${counts[key]}**`);
  return rows.length ? rows.join(' • ') : 'No moderation actions.';
}
function analyticsBounds(windowKey, nowMs = Date.now()) {
  const days = ANALYTICS_WINDOWS[normalizeAnalyticsWindow(windowKey)];
  if (!days) return { start: null, end: nowMs, previousStart: null, previousEnd: null };
  const span = days * 86400000;
  return { start: nowMs - span, end: nowMs, previousStart: nowMs - (span * 2), previousEnd: nowMs - span };
}
function inBounds(timestamp, start, end) { return timestamp > 0 && (start === null || timestamp >= start) && timestamp <= end; }
function getAuditRows(guildId, bounds) {
  try {
    return db.prepare('SELECT actor_id, event, created_at FROM case_audit WHERE guild_id = ? ORDER BY created_at DESC').all(String(guildId)).filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end));
  } catch (error) { console.error('❌ Moderation analytics audit query failed:', error); return []; }
}
function flattenAppeals(cases) { const result = []; for (const modCase of cases) for (const appeal of getCaseAppeals(modCase) || []) result.push({ modCase, appeal }); return result; }
function getModerationAnalytics(guildId, windowKey = '30d') {
  const window = normalizeAnalyticsWindow(windowKey);
  const bounds = analyticsBounds(window);
  const allCases = getAllCases(guildId) || [];
  const cases = allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.start, bounds.end));
  const previousCases = bounds.previousStart === null ? [] : allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.previousStart, bounds.previousEnd));
  const actionCounts = {}; const statusCounts = {}; const moderatorCounts = {}; const userCounts = {};
  for (const modCase of cases) { increment(actionCounts, String(modCase.action || 'unknown')); increment(statusCounts, String(modCase.status || 'active')); increment(moderatorCounts, modCase.moderatorId); increment(userCounts, modCase.userId); }
  const appealRows = flattenAppeals(allCases).filter(({ appeal }) => inBounds(new Date(appeal.submittedAt || 0).getTime(), bounds.start, bounds.end));
  const appealCounts = { pending: 0, approved: 0, denied: 0 };
  for (const { appeal } of appealRows) increment(appealCounts, appeal.status || 'pending');
  const resolvedAppeals = appealCounts.approved + appealCounts.denied;
  const auditRows = getAuditRows(guildId, bounds);
  const moderatorAuditCounts = {}; for (const row of auditRows) increment(moderatorAuditCounts, row.actor_id);
  const trendDays = Math.min(7, ANALYTICS_WINDOWS[window] || 7); const trend = [];
  for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0); dayStart.setUTCDate(dayStart.getUTCDate() - offset);
    const start = dayStart.getTime(); const end = start + 86399999;
    trend.push({ label: dayStart.toISOString().slice(5, 10), count: cases.filter((modCase) => inBounds(getCaseTime(modCase), start, end)).length });
  }
  return {
    window, windowLabel: ANALYTICS_WINDOW_LABELS[window], totalCases: cases.length, previousCases: previousCases.length,
    change: previousCases.length ? Math.round(((cases.length - previousCases.length) / previousCases.length) * 100) : null,
    activeCases: statusCounts.active || 0, reversedCases: statusCounts.reversed || 0, expiredCases: statusCounts.expired || 0,
    actionCounts, uniqueUsers: Object.keys(userCounts).length, repeatOffenders: Object.values(userCounts).filter((count) => count > 1).length,
    topModerators: topEntries(moderatorCounts), topUsers: topEntries(userCounts), appealCounts, resolvedAppeals,
    appealApprovalRate: percentage(appealCounts.approved, resolvedAppeals), reversalRate: percentage(statusCounts.reversed || 0, cases.length),
    auditActions: auditRows.length, moderatorAuditCounts, trend, cases,
  };
}
function getModeratorAnalytics(guildId, moderatorId, windowKey = '30d') {
  const analytics = getModerationAnalytics(guildId, windowKey);
  const cases = analytics.cases.filter((modCase) => String(modCase.moderatorId) === String(moderatorId));
  const actionCounts = {}; const statusCounts = {}; const affectedUsers = {};
  for (const modCase of cases) { increment(actionCounts, String(modCase.action || 'unknown')); increment(statusCounts, String(modCase.status || 'active')); increment(affectedUsers, modCase.userId); }
  const appealCounts = { pending: 0, approved: 0, denied: 0 }; const bounds = analyticsBounds(analytics.window);
  for (const { appeal } of flattenAppeals(cases)) if (inBounds(new Date(appeal.submittedAt || 0).getTime(), bounds.start, bounds.end)) increment(appealCounts, appeal.status || 'pending');
  let auditRows = [];
  try { auditRows = db.prepare('SELECT event, created_at FROM case_audit WHERE guild_id = ? AND actor_id = ? ORDER BY created_at DESC').all(String(guildId), String(moderatorId)).filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end)); }
  catch (error) { console.error('❌ Moderator history audit query failed:', error); }
  const eventCounts = {}; for (const row of auditRows) increment(eventCounts, row.event || 'unknown');
  const resolvedAppeals = appealCounts.approved + appealCounts.denied;
  return {
    ...analytics, moderatorId: String(moderatorId), moderatorCases: cases.length, moderatorActionCounts: actionCounts, moderatorStatusCounts: statusCounts,
    affectedUsers: Object.keys(affectedUsers).length, repeatTargets: Object.values(affectedUsers).filter((count) => count > 1).length,
    moderatorAppeals: appealCounts, moderatorAppealApprovalRate: percentage(appealCounts.approved, resolvedAppeals), moderatorReversalRate: percentage(statusCounts.reversed || 0, cases.length),
    moderatorAuditActions: auditRows.length, topAuditEvents: topEntries(eventCounts), recentCases: cases.slice().sort((a, b) => getCaseTime(b) - getCaseTime(a)).slice(0, 5),
  };
}

function normalizePreset(raw = {}) {
  const action = String(raw.action || '').toLowerCase();
  return {
    id: String(raw.id || crypto.randomBytes(5).toString('hex')).slice(0, 24),
    name: String(raw.name || 'Untitled Preset').trim().slice(0, 80),
    action: PRESET_ACTIONS.has(action) ? action : 'warn',
    reason: String(raw.reason || '').trim().slice(0, 500),
    warnExpiry: String(raw.warnExpiry || 'never').trim().toLowerCase().slice(0, 10) || 'never',
    strikeWeight: Math.min(5, Math.max(1, Number(raw.strikeWeight) || 1)),
    duration: String(raw.duration || '1h').trim().toLowerCase().slice(0, 10) || '1h',
    deleteDays: Math.min(7, Math.max(0, Math.trunc(Number(raw.deleteDays) || 0))),
    enabled: raw.enabled !== false,
    createdBy: raw.createdBy ? String(raw.createdBy) : null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : null,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    usageCount: Math.max(0, Math.trunc(Number(raw.usageCount) || 0)),
    lastUsedAt: raw.lastUsedAt || null,
    lastUsedBy: raw.lastUsedBy ? String(raw.lastUsedBy) : null,
  };
}
function getModerationPresets(guildId) {
  const data = guildManager.getGuildData(guildId);
  const raw = data?.modules?.moderation?.presets;
  return Array.isArray(raw) ? raw.map(normalizePreset).slice(0, MAX_PRESETS) : [];
}
function saveModerationPresets(guild, presets) {
  const data = guildManager.getGuildData(guild.id);
  const modules = { ...(data.modules || {}) };
  modules.moderation = { ...(modules.moderation || {}), presets: presets.map(normalizePreset).slice(0, MAX_PRESETS) };
  guildManager.saveGuildData(guild.id, { modules }, guild);
  return modules.moderation.presets;
}
function getModerationPreset(guildId, presetId) { return getModerationPresets(guildId).find((preset) => preset.id === String(presetId)) || null; }
function validatePresetInput(input = {}) {
  const name = String(input.name || '').trim(); const action = String(input.action || '').trim().toLowerCase(); const reason = String(input.reason || '').trim();
  if (!name) return { error: 'Preset name is required.' };
  if (!PRESET_ACTIONS.has(action)) return { error: 'Action must be warn, timeout, kick, or ban.' };
  if (!reason) return { error: 'Preset reason is required.' };
  const preset = normalizePreset({ ...input, name, action, reason });
  if (action === 'warn') {
    const expiry = String(input.warnExpiry || 'never').trim().toLowerCase() || 'never';
    if (expiry !== 'never' && !/^\d+\s*[dwm]$/.test(expiry)) return { error: 'Warning expiry must be `7d`, `2w`, `1m`, or `never`.' };
    const weight = Number(input.strikeWeight || 1); if (!Number.isInteger(weight) || weight < 1 || weight > 5) return { error: 'Strike weight must be 1-5.' };
    preset.warnExpiry = expiry; preset.strikeWeight = weight;
  }
  if (action === 'timeout') {
    const match = String(input.duration || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/);
    if (!match) return { error: 'Timeout duration must look like `10m`, `1h`, or `1d`.' };
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }; const ms = Number(match[1]) * units[match[2]];
    if (!Number.isFinite(ms) || ms <= 0 || ms > 28 * 86400000) return { error: 'Timeout duration must be greater than 0 and no more than 28 days.' };
    preset.duration = String(input.duration).trim().toLowerCase();
  }
  if (action === 'ban') {
    const days = Number(input.deleteDays || 0); if (!Number.isInteger(days) || days < 0 || days > 7) return { error: 'Ban delete-message days must be 0-7.' }; preset.deleteDays = days;
  }
  return { preset };
}
function upsertModerationPreset(guild, input, actorId, presetId = null) {
  const presets = getModerationPresets(guild.id); const existingIndex = presetId ? presets.findIndex((preset) => preset.id === presetId) : -1;
  if (existingIndex < 0 && presets.length >= MAX_PRESETS) return { ok: false, error: `A server can have up to ${MAX_PRESETS} moderation presets.` };
  const parsed = validatePresetInput(input); if (parsed.error) return { ok: false, error: parsed.error };
  const now = new Date().toISOString();
  const next = existingIndex >= 0
    ? { ...presets[existingIndex], ...parsed.preset, id: presets[existingIndex].id, createdBy: presets[existingIndex].createdBy, createdAt: presets[existingIndex].createdAt, updatedBy: actorId, updatedAt: now }
    : { ...parsed.preset, id: crypto.randomBytes(5).toString('hex'), createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now };
  if (existingIndex >= 0) presets[existingIndex] = next; else presets.push(next);
  saveModerationPresets(guild, presets); return { ok: true, preset: next };
}
function deleteModerationPreset(guild, presetId) {
  const presets = getModerationPresets(guild.id); const next = presets.filter((preset) => preset.id !== String(presetId));
  if (next.length === presets.length) return false; saveModerationPresets(guild, next); return true;
}
function toggleModerationPreset(guild, presetId, actorId) {
  const presets = getModerationPresets(guild.id); const index = presets.findIndex((preset) => preset.id === String(presetId)); if (index < 0) return null;
  presets[index] = { ...presets[index], enabled: !presets[index].enabled, updatedBy: actorId, updatedAt: new Date().toISOString() }; saveModerationPresets(guild, presets); return presets[index];
}
function markPresetUsed(guild, presetId, actorId) {
  const presets = getModerationPresets(guild.id); const index = presets.findIndex((preset) => preset.id === String(presetId)); if (index < 0) return null;
  presets[index] = { ...presets[index], usageCount: presets[index].usageCount + 1, lastUsedAt: new Date().toISOString(), lastUsedBy: actorId || null }; saveModerationPresets(guild, presets); return presets[index];
}
function buildPresetManagerPayload(guild, targetId = 'none') {
  const presets = getModerationPresets(guild.id);
  const embed = createEmbed({ title: '📋 Moderation Presets', description: presets.length ? `Reusable moderation templates for **${guild.name}**. Select one to view, edit or apply it.` : 'No moderation presets exist yet. Create one below.', color: COLORS.PRIMARY, fields: [
    { name: 'Stored', value: `${presets.length}/${MAX_PRESETS}`, inline: true }, { name: 'Selected Target', value: targetId && targetId !== 'none' ? `<@${targetId}>` : 'None', inline: true },
    { name: 'Safety', value: 'Applying a preset opens the normal moderation form. Existing permission, hierarchy, validation, confirmation, logging and appeal flows still apply.', inline: false },
  ] });
  const rows = [];
  if (presets.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_preset_select:${targetId || 'none'}`).setPlaceholder('Select a moderation preset').addOptions(presets.map((preset) => ({ label: preset.name.slice(0, 100), value: preset.id, description: `${preset.enabled ? 'Enabled' : 'Disabled'} • ${preset.action} • ${preset.usageCount} uses`.slice(0, 100) })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_preset_create:${targetId || 'none'}`).setLabel('➕ Create Preset').setStyle(ButtonStyle.Primary).setDisabled(presets.length >= MAX_PRESETS),
    new ButtonBuilder().setCustomId(`mod_dashboard:${targetId || 'none'}:tools`).setLabel('← Tools').setStyle(ButtonStyle.Secondary)
  ));
  return { embeds: [embed], components: rows };
}
function buildPresetDetailPayload(guild, preset, targetId = 'none') {
  const detail = preset.action === 'warn' ? `Weight **${preset.strikeWeight}** • Expiry **${preset.warnExpiry}**` : preset.action === 'timeout' ? `Duration **${preset.duration}**` : preset.action === 'ban' ? `Delete days **${preset.deleteDays}**` : 'No additional action settings';
  const embed = createEmbed({ title: `📋 ${preset.name}`, description: `Action: **${preset.action.toUpperCase()}** • ${preset.enabled ? 'Enabled ✅' : 'Disabled ⛔'}`, color: COLORS.PRIMARY, fields: [
    { name: 'Reason', value: preset.reason, inline: false }, { name: 'Settings', value: detail, inline: false }, { name: 'Usage', value: `**${preset.usageCount}** submissions${preset.lastUsedAt ? ` • last used <t:${Math.floor(new Date(preset.lastUsedAt).getTime() / 1000)}:R>` : ''}`, inline: false },
    { name: 'Selected Target', value: targetId !== 'none' ? `<@${targetId}>` : 'None selected', inline: false },
  ] });
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_preset_apply:${preset.id}:${targetId}`).setLabel('▶ Apply').setStyle(ButtonStyle.Success).setDisabled(!preset.enabled || targetId === 'none'),
    new ButtonBuilder().setCustomId(`mod_preset_edit:${preset.id}:${targetId}`).setLabel('✏️ Edit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mod_preset_toggle:${preset.id}:${targetId}`).setLabel(preset.enabled ? '⏸ Disable' : '▶ Enable').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_preset_delete:${preset.id}:${targetId}`).setLabel('🗑 Delete').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mod_presets:${targetId}`).setLabel('← Presets').setStyle(ButtonStyle.Secondary)
  )] };
}
function buildPresetEditorModal(preset = null, targetId = 'none') {
  const value = preset || normalizePreset({ name: '', action: 'warn', reason: '', warnExpiry: 'never', strikeWeight: 1 });
  const secondary = value.action === 'warn' ? value.warnExpiry : value.action === 'timeout' ? value.duration : '';
  const numeric = value.action === 'warn' ? String(value.strikeWeight) : value.action === 'ban' ? String(value.deleteDays) : '';
  return new ModalBuilder().setCustomId(`mod_preset_save:${preset?.id || 'new'}:${targetId}`).setTitle(preset ? 'Edit Moderation Preset' : 'Create Moderation Preset').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Preset Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(String(value.name || '').slice(0, 80))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('action').setLabel('Action: warn / timeout / kick / ban').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(String(value.action || 'warn'))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(String(value.reason || '').slice(0, 500))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('secondary').setLabel('Warn expiry OR timeout duration').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('warn: 7d/2w/1m/never • timeout: 1h').setValue(String(secondary || '').slice(0, 10))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('numeric').setLabel('Warn weight (1-5) OR ban delete days (0-7)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1).setValue(String(numeric || '').slice(0, 1)))
  );
}
function buildPresetExecutionModal(preset, targetId) {
  const suffix = `:preset:${preset.id}`;
  if (preset.action === 'warn') return new ModalBuilder().setCustomId(`mod_submit_warn:${targetId}${suffix}`).setTitle(`Warn • ${preset.name}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('strike_weight').setLabel('Strike weight (1-5)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1).setValue(String(preset.strikeWeight))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('warn_expiry').setLabel('Warn expiry (7d, 2w, 1m, or never)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(preset.warnExpiry)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(preset.reason))
  );
  const modal = new ModalBuilder().setCustomId(`mod_submit_${preset.action}:${targetId}${suffix}`).setTitle(`${preset.action[0].toUpperCase()}${preset.action.slice(1)} • ${preset.name}`);
  const rows = [];
  if (preset.action === 'ban') rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Delete message days (0-7)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setValue(String(preset.deleteDays))));
  if (preset.action === 'timeout') rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duration (10m, 1h, 1d)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(preset.duration)));
  rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(preset.reason)));
  return modal.addComponents(...rows);
}
function presetIdFromSubmission(customId) { const match = String(customId || '').match(/:preset:([a-f0-9]{6,24})$/i); return match ? match[1] : null; }

function buildDashboardNav(targetId, activeView = DEFAULT_VIEW) {
  const items = [['overview', 'Overview'], ['actions', 'Actions'], ['cases', 'Cases'], ['tools', 'Tools'], ['analytics', 'Analytics']];
  return [new ActionRowBuilder().addComponents(items.map(([view, label]) => new ButtonBuilder().setCustomId(`mod_dashboard:${targetId || 'none'}:${view}`).setLabel(label).setStyle(activeView === view ? ButtonStyle.Primary : ButtonStyle.Secondary)))];
}
function buildUserSelectRow() { return new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('mod_user_select').setPlaceholder('👤 Select any server member to moderate').setMinValues(1).setMaxValues(1)); }
function buildActionSelect(targetId) { return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_action_select:${targetId || 'none'}`).setPlaceholder('Choose an action').setDisabled(!targetId).addOptions(
  { label: 'Warn', value: 'warn' }, { label: 'Timeout', value: 'timeout' }, { label: 'Kick', value: 'kick' }, { label: 'Ban', value: 'ban' }, { label: 'Remove Warning', value: 'remove-warning' }, { label: 'Remove Timeout', value: 'remove-timeout' }
))]; }
function buildActionsRows(targetId, member, guild) {
  const id = targetId || 'none'; const permissions = { warn: canUseModAction(member, guild, 'warn'), timeout: canUseModAction(member, guild, 'timeout'), kick: canUseModAction(member, guild, 'kick'), ban: canUseModAction(member, guild, 'ban'), removeWarning: canUseModAction(member, guild, 'remove_warning'), removeTimeout: canUseModAction(member, guild, 'remove_timeout') };
  return [buildUserSelectRow(), ...buildActionSelect(targetId), new ActionRowBuilder().addComponents(
    createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️'), !targetId || !permissions.warn), createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳'), !targetId || !permissions.timeout), createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢'), !targetId || !permissions.kick), createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨'), !targetId || !permissions.ban)
  ), new ActionRowBuilder().addComponents(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warning', getEmoji('DELETE', '🗑️'), !targetId || !permissions.removeWarning), createSecondaryButton(`mod_remove_timeout:${id}`, 'Remove Timeout', getEmoji('SUCCESS', '✅'), !targetId || !permissions.removeTimeout), createSuccessButton(`mod_refresh:${id}:overview`, 'Refresh', getEmoji('REFRESH', '🔄')))];
}
function buildToolsRows(targetId, member, guild) {
  const id = targetId || 'none'; const permissions = { viewCaseDetail: canUseModAction(member, guild, 'view_case_detail'), editCase: canUseModAction(member, guild, 'edit_case'), bulkWarn: canUseModAction(member, guild, 'bulk_warn'), bulkTimeout: canUseModAction(member, guild, 'bulk_timeout'), bulkKick: canUseModAction(member, guild, 'bulk_kick'), bulkBan: canUseModAction(member, guild, 'bulk_ban'), searchCases: canUseModAction(member, guild, 'view_case_detail') };
  return [buildUserSelectRow(), new ActionRowBuilder().addComponents(createPrimaryButton('mod_select_user', 'Select User', getEmoji('USER', '👤')), createSecondaryButton(`mod_case_detail:${id}`, 'Case Detail', getEmoji('SEARCH', '🔎'), !targetId || !permissions.viewCaseDetail), createSecondaryButton(`mod_edit_case:${id}`, 'Edit Case', getEmoji('EDIT', '✏️'), !targetId || !permissions.editCase), createSecondaryButton(`mod_presets:${id}`, 'Presets', '📋')), new ActionRowBuilder().addComponents(createSecondaryButton('mod_case_search', 'Search Cases', getEmoji('SEARCH', '🔎'), !permissions.searchCases), createSecondaryButton('mod_bulk_warn', 'Bulk Warn', getEmoji('WARNING', '⚠️'), !permissions.bulkWarn), createSecondaryButton('mod_bulk_timeout', 'Bulk Timeout', getEmoji('TIMEOUT', '⏳'), !permissions.bulkTimeout), createSecondaryButton('mod_bulk_kick', 'Bulk Kick', getEmoji('KICK', '👢'), !permissions.bulkKick)), new ActionRowBuilder().addComponents(createDangerButton('mod_bulk_ban', 'Bulk Ban', getEmoji('BAN', '🔨'), !permissions.bulkBan))];
}
function buildOverviewEmbed(guild, moderator, target, stats = {}, staffDisplay = null) { return createEmbed({ title: 'Moderation Command Centre', description: target ? `Target: ${target.user}` : 'No target selected.', color: COLORS.PRIMARY, fields: [{ name: 'Staff', value: staffDisplay || String(moderator || 'Unknown'), inline: false }, { name: 'Warnings', value: String(stats.warningCount ?? 0), inline: true }, { name: 'Cases', value: String(stats.caseCount ?? 0), inline: true }, { name: 'Latest Case', value: stats.lastCaseSummary || 'No cases found.', inline: false }] }); }
function buildActionsEmbed(interaction, target) { return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`🔐` Moderation Actions').setDescription(target ? [`\`👤\` **Target:** ${target.user}`, `\`🆔\` **User ID:** \`${target.id}\``, `\`🏷️\` **User Tag:** \`${target.user.tag}\``, '', '`⚡` Choose a moderation action below.'].join('\n') : ['`⚠️` **No user selected**', '', 'Use the user selector below to choose any member in this server.'].join('\n')); }
function buildCasesEmbed(target, cases = [], page = 0, totalPages = 1, actionFilter = 'all', statusFilter = 'all') { const description = cases.length ? cases.map((entry) => `#${entry.caseId} - ${entry.action} - ${getStatusLabel(entry)}\nReason: ${entry.reason || 'No reason provided'}`).join('\n\n') : 'No cases found for this user.'; return createEmbed({ title: target?.user?.tag ? `Cases - ${target.user.tag}` : 'Cases', description, color: COLORS.PRIMARY, footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}` }); }
function buildToolsEmbed(interaction) { return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`🧰` Moderation Tools').setDescription(['`⚙️` Utility actions, presets and bulk moderation controls.', '', '`📋` Presets save reusable reasons and action settings without bypassing normal safeguards.', '`👤` Select a user to inspect cases or apply presets.', '`🔎` Search the full moderation case history.', '`📦` Bulk tools remain permission-gated.'].join('\n')); }
function buildAnalyticsOverviewEmbed(guild, analytics) {
  const trend = analytics.trend.map((entry) => `${entry.label}: **${entry.count}**`).join(' • '); const topModerators = analytics.topModerators.length ? analytics.topModerators.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderator activity.'; const topUsers = analytics.topUsers.length ? analytics.topUsers.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderated users.'; const appeal = analytics.appealCounts; const changeText = analytics.change === null ? 'No previous-period baseline' : `${analytics.change >= 0 ? '+' : ''}${analytics.change}% vs previous period`;
  return createEmbed({ title: `📊 Moderation Analytics • ${analytics.windowLabel}`, description: `Stats for **${guild?.name || 'this server'}**\n${changeText}`, color: COLORS.PRIMARY, fields: [
    { name: 'Cases', value: `Total **${analytics.totalCases}** • Active **${analytics.activeCases}** • Reversed **${analytics.reversedCases}** • Expired **${analytics.expiredCases}**`, inline: false }, { name: 'Actions', value: formatActionBreakdown(analytics.actionCounts), inline: false }, { name: 'Members', value: `Unique **${analytics.uniqueUsers}** • Repeat offenders **${analytics.repeatOffenders}**`, inline: true }, { name: 'Reversal Rate', value: analytics.reversalRate, inline: true }, { name: 'Audit Activity', value: `${analytics.auditActions} events`, inline: true }, { name: 'Appeals', value: `Pending **${appeal.pending}** • Approved **${appeal.approved}** • Denied **${appeal.denied}** • Approval rate **${analytics.appealApprovalRate}**`, inline: false }, { name: 'Top Moderators', value: topModerators.slice(0, 1024), inline: true }, { name: 'Repeat / Frequent Members', value: topUsers.slice(0, 1024), inline: true }, { name: 'Recent Daily Case Trend', value: trend || 'No recent cases.', inline: false },
  ], footer: 'Select a moderator below for individual history and performance.' });
}
function buildModeratorAnalyticsEmbed(guild, analytics) {
  const appeals = analytics.moderatorAppeals; const recentCases = analytics.recentCases.length ? analytics.recentCases.map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • <@${entry.userId}>`).join('\n') : 'No cases in this period.'; const auditEvents = analytics.topAuditEvents.length ? analytics.topAuditEvents.map(([event, count]) => `${String(event).replace(/^case\./, '')}: **${count}**`).join('\n') : 'No audited activity.';
  return createEmbed({ title: `👤 Moderator History • ${analytics.windowLabel}`, description: `Moderator <@${analytics.moderatorId}> • ${guild?.name || 'Server'}`, color: COLORS.PRIMARY, fields: [
    { name: 'Case Activity', value: `Cases **${analytics.moderatorCases}** • Affected users **${analytics.affectedUsers}** • Repeat targets **${analytics.repeatTargets}**`, inline: false }, { name: 'Actions', value: formatActionBreakdown(analytics.moderatorActionCounts), inline: false }, { name: 'Case Outcomes', value: `Active **${analytics.moderatorStatusCounts.active || 0}** • Reversed **${analytics.moderatorStatusCounts.reversed || 0}** • Expired **${analytics.moderatorStatusCounts.expired || 0}** • Reversal rate **${analytics.moderatorReversalRate}**`, inline: false }, { name: 'Appeals on Their Cases', value: `Pending **${appeals.pending}** • Approved **${appeals.approved}** • Denied **${appeals.denied}** • Approval rate **${analytics.moderatorAppealApprovalRate}**`, inline: false }, { name: 'Audited Staff Activity', value: `**${analytics.moderatorAuditActions}** events`, inline: true }, { name: 'Top Audit Events', value: auditEvents.slice(0, 1024), inline: true }, { name: 'Recent Cases', value: recentCases.slice(0, 1024), inline: false },
  ], footer: 'Metrics describe recorded moderation activity; they are not a staff quality score.' });
}
function buildAnalyticsRows(windowKey, mode = 'overview', moderatorId = null, currentUserId = null) {
  const window = normalizeAnalyticsWindow(windowKey); const windowRow = new ActionRowBuilder().addComponents(Object.keys(ANALYTICS_WINDOWS).map((key) => new ButtonBuilder().setCustomId(`mod_analytics_window:${key}:${mode}:${moderatorId || 'none'}`).setLabel(ANALYTICS_WINDOW_LABELS[key]).setStyle(window === key ? ButtonStyle.Primary : ButtonStyle.Secondary))); const selectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`mod_analytics_moderator_select:${window}`).setPlaceholder('👤 Select moderator for history').setMinValues(1).setMaxValues(1)); const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_analytics_overview:${window}`).setLabel('📊 Overview').setStyle(mode === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`mod_analytics_my:${window}:${currentUserId || 'none'}`).setLabel('👤 My History').setStyle(mode === 'moderator' && moderatorId === currentUserId ? ButtonStyle.Primary : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`mod_analytics_refresh:${window}:${mode}:${moderatorId || 'none'}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mod_case_appeal_queue:0').setLabel('⚖️ Appeal Queue').setStyle(ButtonStyle.Secondary)); return [windowRow, selectRow, actionRow];
}
function buildTargetStats(guildId, target) { if (!target) return { warningCount: undefined, caseCount: undefined, lastCaseSummary: null }; const cases = getCasesForUser(guildId, target.id) || []; return { warningCount: getWarningCountForUser(guildId, target.id), caseCount: getCaseCountForUser(guildId, target.id), lastCaseSummary: cases[0] ? formatCaseSummary(cases[0]) : null }; }
function getCasesPageData(guildId, targetId, options = {}) { const actionFilter = options.actionFilter || 'all'; const statusFilter = options.statusFilter || 'all'; const filters = {}; if (actionFilter !== 'all') filters.action = actionFilter; if (statusFilter !== 'all') filters.status = statusFilter; const allCases = getFilteredCases(guildId, targetId, filters) || []; const totalPages = Math.max(1, Math.ceil(allCases.length / CASES_PER_PAGE)); const page = Math.max(0, Math.min(Number(options.page) || 0, totalPages - 1)); return { actionFilter, statusFilter, page, totalPages, pageCases: allCases.slice(page * CASES_PER_PAGE, (page + 1) * CASES_PER_PAGE) }; }

async function buildDashboardPayload(discord, interaction, target, view = DEFAULT_VIEW, options = {}) {
  await syncExpiredWarningsToCases(interaction.guild.id); const context = normalizeDashboardContext({ ...options, view }); const safeView = context.view; const targetId = target?.id || null; const stats = buildTargetStats(interaction.guild.id, target); const staff = getStaffDisplay(interaction.member, interaction.guild); const staffDisplay = `${staff.badge} ${staff.label} • ${interaction.member}`; const embeds = []; const components = [...buildDashboardNav(targetId, safeView)];
  if (safeView === 'overview') { embeds.push(buildOverviewEmbed(interaction.guild, interaction.member, target, stats, staffDisplay)); components.push(...buildActionsRows(targetId, interaction.member, interaction.guild)); }
  else if (safeView === 'actions') { embeds.push(buildActionsEmbed(interaction, target)); components.push(...buildActionsRows(targetId, interaction.member, interaction.guild)); }
  else if (safeView === 'cases') { if (!target) { embeds.push(baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`📁` Cases').setDescription(['`⚠️` **No user selected**', '', 'Use the user selector below to choose any member first.'].join('\n'))); components.push(buildUserSelectRow()); } else { const pageData = getCasesPageData(interaction.guild.id, target.id, context); embeds.push(buildCasesEmbed(target, pageData.pageCases, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter)); components.push(buildUserSelectRow(), ...buildCasesPageButtons(target.id, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter), ...buildCaseFilterButtons(target.id, pageData.actionFilter, pageData.statusFilter, pageData.page)); } }
  else if (safeView === 'tools') { embeds.push(buildToolsEmbed(interaction)); components.push(...buildToolsRows(targetId, interaction.member, interaction.guild)); }
  else if (safeView === 'analytics') { const window = context.analyticsWindow; if (context.analyticsMode === 'moderator' && context.analyticsModeratorId) embeds.push(buildModeratorAnalyticsEmbed(interaction.guild, getModeratorAnalytics(interaction.guild.id, context.analyticsModeratorId, window))); else embeds.push(buildAnalyticsOverviewEmbed(interaction.guild, getModerationAnalytics(interaction.guild.id, window))); components.push(...buildAnalyticsRows(window, context.analyticsMode, context.analyticsModeratorId, interaction.user?.id || null)); }
  return { embeds, components: components.slice(0, 5) };
}
async function renderDashboard(interaction, targetId, view = DEFAULT_VIEW, context = {}) { const target = targetId && targetId !== 'none' ? await fetchTarget(interaction.guild, targetId) : null; if (targetId && targetId !== 'none' && !target) return safeReply(interaction, ephemeralError('Could not find the selected user.')); await interaction.update(await buildDashboardPayload(Discord, interaction, target, view, context)); return true; }
async function refreshDashboard(discord, interaction, target, context = {}) { const safeContext = normalizeDashboardContext(context); const payload = await buildDashboardPayload(discord, interaction, target, safeContext.view, safeContext); try { if (interaction.message) { await interaction.message.edit(payload); return true; } if (interaction.replied || interaction.deferred) { await interaction.editReply(payload); return true; } await interaction.reply({ ...payload, flags: 64 }); return true; } catch (error) { console.error('❌ Failed to refresh moderation dashboard message:', error); return false; } }
async function refreshCasesDashboard(interaction, target) { if (!target) return false; return refreshDashboard(Discord, interaction, target, DEFAULT_CASES_CONTEXT); }
async function handleDashboardNavigation(interaction) {
  const id = String(interaction.customId || ''); if (id === 'mod:overview') return renderDashboard(interaction, 'none', 'overview');
  if (id.startsWith('mod_analytics_window:')) { const [, window, mode = 'overview', moderatorId = 'none'] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId }); }
  if (id.startsWith('mod_analytics_overview:')) { const [, window] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'overview' }); }
  if (id.startsWith('mod_analytics_my:')) { const [, window, moderatorId] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId }); }
  if (id.startsWith('mod_analytics_refresh:')) { const [, window, mode, moderatorId = 'none'] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId }); }
  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) { const [, targetId = 'none', view = DEFAULT_VIEW] = id.split(':'); return renderDashboard(interaction, targetId, view, view === 'analytics' ? DEFAULT_ANALYTICS_CONTEXT : {}); }
  if (id.startsWith('mod_filter_cases:') || id.startsWith('mod_case_page:')) { const [, targetId = 'none', actionFilter = 'all', statusFilter = 'all', page = '0'] = id.split(':'); return renderDashboard(interaction, targetId, 'cases', { actionFilter, statusFilter, page }); }
  return false;
}
async function handleUserSelectMenu(interaction) {
  if (String(interaction.customId || '').startsWith('mod_analytics_moderator_select:')) { const [, window] = String(interaction.customId).split(':'); const moderatorId = interaction.values?.[0]; if (!moderatorId) return safeReply(interaction, ephemeralError('No moderator selected.')); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId }); }
  if (interaction.customId !== 'mod_user_select') return false; const target = await fetchTarget(interaction.guild, interaction.values[0]); if (!target) return safeReply(interaction, ephemeralError('Could not find that user.')); return renderDashboard(interaction, target.id, 'overview');
}
async function handleSelectUserButton(interaction) { if (interaction.customId !== 'mod_select_user') return false; return safeReply(interaction, { content: '👤 Select a user:', components: [buildUserSelectRow()], flags: 64 }); }
async function handlePresetInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (interaction.isStringSelectMenu?.() && id.startsWith('mod_preset_select:')) { const [, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, interaction.values?.[0]); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, preset, targetId), flags: 64 }); }
  if (!interaction.isButton?.()) return false;
  if (id.startsWith('mod_presets:')) { const [, targetId = 'none'] = id.split(':'); return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_create:')) { const [, targetId = 'none'] = id.split(':'); await interaction.showModal(buildPresetEditorModal(null, targetId)); return true; }
  if (id.startsWith('mod_preset_edit:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); await interaction.showModal(buildPresetEditorModal(preset, targetId)); return true; }
  if (id.startsWith('mod_preset_toggle:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = toggleModerationPreset(interaction.guild, presetId, interaction.user?.id); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, preset, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_delete:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { content: `Delete preset **${preset.name}**?`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_preset_delete_confirm:${presetId}:${targetId}`).setLabel('Confirm Delete').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`mod_preset_edit:${presetId}:${targetId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))], flags: 64 }); }
  if (id.startsWith('mod_preset_delete_confirm:')) { const [, presetId, targetId = 'none'] = id.split(':'); if (!deleteModerationPreset(interaction.guild, presetId)) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_apply:')) {
    const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset || !preset.enabled) return safeReply(interaction, ephemeralError('Preset is unavailable or disabled.')); if (targetId === 'none') return safeReply(interaction, ephemeralError('Select a moderation target first.'));
    if (!canUseModAction(interaction.member, interaction.guild, preset.action)) return safeReply(interaction, ephemeralError(`No permission to use ${preset.action}.`));
    const target = await fetchTarget(interaction.guild, targetId); if (!target) return safeReply(interaction, ephemeralError('Could not find the selected target.'));
    await interaction.showModal(buildPresetExecutionModal(preset, targetId)); return true;
  }
  return false;
}
async function handlePresetModal(interaction) {
  const id = String(interaction.customId || ''); if (!id.startsWith('mod_preset_save:')) return false;
  const [, presetIdRaw, targetId = 'none'] = id.split(':'); const presetId = presetIdRaw === 'new' ? null : presetIdRaw;
  const result = upsertModerationPreset(interaction.guild, {
    name: interaction.fields.getTextInputValue('name'), action: interaction.fields.getTextInputValue('action'), reason: interaction.fields.getTextInputValue('reason'),
    warnExpiry: interaction.fields.getTextInputValue('secondary') || 'never', duration: interaction.fields.getTextInputValue('secondary') || '1h', strikeWeight: interaction.fields.getTextInputValue('numeric') || 1, deleteDays: interaction.fields.getTextInputValue('numeric') || 0,
  }, interaction.user?.id || null, presetId);
  if (!result.ok) return safeReply(interaction, ephemeralError(result.error));
  return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, result.preset, targetId), flags: 64 });
}
async function openModPanel(interaction, options = {}) { if (!canOpenModPanel(interaction)) return interaction.deferred || interaction.replied ? interaction.editReply(noAccessPayload()) : interaction.reply(noAccessPayload()); const view = options.view || DEFAULT_VIEW; const target = options.target || null; const payload = await buildDashboardPayload(Discord, interaction, target, view, options); const finalPayload = { ...payload, flags: 64 }; return interaction.deferred || interaction.replied ? interaction.editReply(finalPayload) : interaction.reply(finalPayload); }

module.exports = {
  openModPanel, refreshDashboard, refreshCasesDashboard, handleDashboardNavigation, handleUserSelectMenu, handleSelectUserButton,
  handlePresetInteraction, handlePresetModal, presetIdFromSubmission, markPresetUsed,
  getModerationAnalytics, getModeratorAnalytics, getModerationPresets, getModerationPreset,
};
