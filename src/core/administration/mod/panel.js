'use strict';

const crypto = require('node:crypto');
const Discord = require('discord.js');
const {
  ActionRowBuilder,
  AttachmentBuilder,
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

const DEFAULT_VIEW = 'member';
const CASES_PER_PAGE = 5;
const VIEW_ALIASES = Object.freeze({ overview: 'member' });
const ALLOWED_VIEWS = new Set(['member', 'actions', 'intelligence', 'cases', 'analytics']);
const ANALYTICS_WINDOWS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });
const ANALYTICS_WINDOW_LABELS = Object.freeze({ '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', all: 'All Time' });
const DEFAULT_CASES_CONTEXT = Object.freeze({ view: 'cases', actionFilter: 'all', statusFilter: 'all', page: 0 });
const DEFAULT_ACTIONS_CONTEXT = Object.freeze({ view: 'actions', actionFilter: 'all', statusFilter: 'all', page: 0 });
const DEFAULT_ANALYTICS_CONTEXT = Object.freeze({ view: 'analytics', analyticsWindow: '30d', analyticsMode: 'overview', analyticsModeratorId: null });
const PRESET_ACTIONS = new Set(['warn', 'timeout', 'kick', 'ban']);
const MAX_PRESETS = 20;
const EXPORT_SCOPES = new Set(['all', 'user', 'moderator', 'case']);
const EXPORT_FORMATS = new Set(['json', 'csv']);
const EXPORT_INCLUDE_KEYS = new Set(['core', 'metadata', 'appeals', 'evidence', 'audit']);
const MAX_EXPORT_CASES = 10000;
const MAX_EXPORT_FILE_BYTES = 7 * 1024 * 1024;
const MAX_EXPORT_ATTACHMENTS = 10;

function canOpenModPanel(interaction) { return Boolean(interaction?.guild && interaction?.member && hasModPermission(interaction.member, interaction.guild)); }
function noAccessPayload() { return { content: '❌ You do not have permission to use the moderation panel.', flags: 64 }; }
function normalizeAnalyticsWindow(value) { return Object.prototype.hasOwnProperty.call(ANALYTICS_WINDOWS, value) ? value : '30d'; }
function normalizeView(value) { const aliased = VIEW_ALIASES[value] || value; return ALLOWED_VIEWS.has(aliased) ? aliased : DEFAULT_VIEW; }
function normalizeDashboardContext(context = {}) {
  return {
    view: normalizeView(context.view),
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
function timestamp(value, style = 'R') { const ms = Number(value); return Number.isFinite(ms) && ms > 0 ? `<t:${Math.floor(ms / 1000)}:${style}>` : 'Unknown'; }
function targetHasActiveTimeout(target) { return Number(target?.communicationDisabledUntilTimestamp || 0) > Date.now(); }
function formatActionBreakdown(counts = {}) {
  const order = ['warn', 'timeout', 'kick', 'ban', 'unwarn', 'remove-timeout'];
  const rows = order.filter((key) => counts[key]).map((key) => `${key}: **${counts[key]}**`);
  return rows.length ? rows.join(' • ') : 'No moderation actions.';
}
function hasAny(member, guild, actions) { return actions.some((action) => canUseModAction(member, guild, action)); }
function canViewDashboardSection(member, guild, view) {
  const normalized = normalizeView(view);
  if (normalized === 'member') return canUseModAction(member, guild, 'view_dashboard');
  if (normalized === 'actions') return hasAny(member, guild, ['warn', 'timeout', 'remove_timeout', 'kick', 'ban', 'remove_warning']);
  if (normalized === 'intelligence') return hasAny(member, guild, ['scan_run', 'scan_history', 'scan_compare', 'scan_suspects', 'scan_network', 'scan_notes', 'scan_watch', 'scan_links']);
  if (normalized === 'cases') return canUseModAction(member, guild, 'view_cases');
  if (normalized === 'analytics') return canUseModAction(member, guild, 'view_analytics');
  return false;
}
function workspaceStats(guildId) {
  const cases = getAllCases(guildId) || [];
  const activeCases = cases.filter((entry) => String(entry.status || 'active') === 'active').length;
  let activeWarnings = 0;
  try { activeWarnings = Number(db.prepare('SELECT COUNT(*) AS count FROM warnings WHERE guild_id = ? AND (expires_at IS NULL OR expires_at > ?)').get(String(guildId), new Date().toISOString())?.count || 0); }
  catch { activeWarnings = cases.filter((entry) => entry.action === 'warn' && String(entry.status || 'active') === 'active').length; }
  let pendingAppeals = 0;
  for (const modCase of cases) for (const appeal of getCaseAppeals(modCase) || []) if ((appeal.status || 'pending') === 'pending') pendingAppeals += 1;
  return { totalCases: cases.length, activeCases, activeWarnings, pendingAppeals };
}

function analyticsBounds(windowKey, nowMs = Date.now()) {
  const days = ANALYTICS_WINDOWS[normalizeAnalyticsWindow(windowKey)];
  if (!days) return { start: null, end: nowMs, previousStart: null, previousEnd: null };
  const span = days * 86400000;
  return { start: nowMs - span, end: nowMs, previousStart: nowMs - (span * 2), previousEnd: nowMs - span };
}
function inBounds(value, start, end) { return value > 0 && (start === null || value >= start) && value <= end; }
function getAuditRows(guildId, bounds) {
  try { return db.prepare('SELECT actor_id, event, created_at FROM case_audit WHERE guild_id = ? ORDER BY created_at DESC').all(String(guildId)).filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end)); }
  catch (error) { console.error('❌ Moderation analytics audit query failed:', error); return []; }
}
function flattenAppeals(cases) { const result = []; for (const modCase of cases) for (const appeal of getCaseAppeals(modCase) || []) result.push({ modCase, appeal }); return result; }
function getModerationAnalytics(guildId, windowKey = '30d') {
  const window = normalizeAnalyticsWindow(windowKey); const bounds = analyticsBounds(window); const allCases = getAllCases(guildId) || [];
  const cases = allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.start, bounds.end));
  const previousCases = bounds.previousStart === null ? [] : allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.previousStart, bounds.previousEnd));
  const actionCounts = {}; const statusCounts = {}; const moderatorCounts = {}; const userCounts = {};
  for (const modCase of cases) { increment(actionCounts, String(modCase.action || 'unknown')); increment(statusCounts, String(modCase.status || 'active')); increment(moderatorCounts, modCase.moderatorId); increment(userCounts, modCase.userId); }
  const appealRows = flattenAppeals(allCases).filter(({ appeal }) => inBounds(new Date(appeal.submittedAt || 0).getTime(), bounds.start, bounds.end));
  const appealCounts = { pending: 0, approved: 0, denied: 0 }; for (const { appeal } of appealRows) increment(appealCounts, appeal.status || 'pending');
  const resolvedAppeals = appealCounts.approved + appealCounts.denied; const auditRows = getAuditRows(guildId, bounds); const moderatorAuditCounts = {}; for (const row of auditRows) increment(moderatorAuditCounts, row.actor_id);
  const trendDays = Math.min(7, ANALYTICS_WINDOWS[window] || 7); const trend = [];
  for (let offset = trendDays - 1; offset >= 0; offset -= 1) { const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0); dayStart.setUTCDate(dayStart.getUTCDate() - offset); const start = dayStart.getTime(); const end = start + 86399999; trend.push({ label: dayStart.toISOString().slice(5, 10), count: cases.filter((modCase) => inBounds(getCaseTime(modCase), start, end)).length }); }
  return { window, windowLabel: ANALYTICS_WINDOW_LABELS[window], totalCases: cases.length, previousCases: previousCases.length, change: previousCases.length ? Math.round(((cases.length - previousCases.length) / previousCases.length) * 100) : null, activeCases: statusCounts.active || 0, reversedCases: statusCounts.reversed || 0, expiredCases: statusCounts.expired || 0, actionCounts, uniqueUsers: Object.keys(userCounts).length, repeatOffenders: Object.values(userCounts).filter((count) => count > 1).length, topModerators: topEntries(moderatorCounts), topUsers: topEntries(userCounts), appealCounts, resolvedAppeals, appealApprovalRate: percentage(appealCounts.approved, resolvedAppeals), reversalRate: percentage(statusCounts.reversed || 0, cases.length), auditActions: auditRows.length, moderatorAuditCounts, trend, cases };
}
function getModeratorAnalytics(guildId, moderatorId, windowKey = '30d') {
  const analytics = getModerationAnalytics(guildId, windowKey); const cases = analytics.cases.filter((modCase) => String(modCase.moderatorId) === String(moderatorId));
  const actionCounts = {}; const statusCounts = {}; const affectedUsers = {}; for (const modCase of cases) { increment(actionCounts, String(modCase.action || 'unknown')); increment(statusCounts, String(modCase.status || 'active')); increment(affectedUsers, modCase.userId); }
  const appealCounts = { pending: 0, approved: 0, denied: 0 }; const bounds = analyticsBounds(analytics.window); for (const { appeal } of flattenAppeals(cases)) if (inBounds(new Date(appeal.submittedAt || 0).getTime(), bounds.start, bounds.end)) increment(appealCounts, appeal.status || 'pending');
  let auditRows = []; try { auditRows = db.prepare('SELECT event, created_at FROM case_audit WHERE guild_id = ? AND actor_id = ? ORDER BY created_at DESC').all(String(guildId), String(moderatorId)).filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end)); } catch (error) { console.error('❌ Moderator history audit query failed:', error); }
  const eventCounts = {}; for (const row of auditRows) increment(eventCounts, row.event || 'unknown'); const resolvedAppeals = appealCounts.approved + appealCounts.denied;
  return { ...analytics, moderatorId: String(moderatorId), moderatorCases: cases.length, moderatorActionCounts: actionCounts, moderatorStatusCounts: statusCounts, affectedUsers: Object.keys(affectedUsers).length, repeatTargets: Object.values(affectedUsers).filter((count) => count > 1).length, moderatorAppeals: appealCounts, moderatorAppealApprovalRate: percentage(appealCounts.approved, resolvedAppeals), moderatorReversalRate: percentage(statusCounts.reversed || 0, cases.length), moderatorAuditActions: auditRows.length, topAuditEvents: topEntries(eventCounts), recentCases: cases.slice().sort((a, b) => getCaseTime(b) - getCaseTime(a)).slice(0, 5) };
}

function normalizePreset(raw = {}) { const action = String(raw.action || '').toLowerCase(); return { id: String(raw.id || crypto.randomBytes(5).toString('hex')).slice(0, 24), name: String(raw.name || 'Untitled Preset').trim().slice(0, 80), action: PRESET_ACTIONS.has(action) ? action : 'warn', reason: String(raw.reason || '').trim().slice(0, 500), warnExpiry: String(raw.warnExpiry || 'never').trim().toLowerCase().slice(0, 10) || 'never', strikeWeight: Math.min(5, Math.max(1, Number(raw.strikeWeight) || 1)), duration: String(raw.duration || '1h').trim().toLowerCase().slice(0, 10) || '1h', deleteDays: Math.min(7, Math.max(0, Math.trunc(Number(raw.deleteDays) || 0))), enabled: raw.enabled !== false, createdBy: raw.createdBy ? String(raw.createdBy) : null, createdAt: raw.createdAt || new Date().toISOString(), updatedBy: raw.updatedBy ? String(raw.updatedBy) : null, updatedAt: raw.updatedAt || new Date().toISOString(), usageCount: Math.max(0, Math.trunc(Number(raw.usageCount) || 0)), lastUsedAt: raw.lastUsedAt || null, lastUsedBy: raw.lastUsedBy ? String(raw.lastUsedBy) : null } }
function getModerationPresets(guildId) { const raw = guildManager.getGuildData(guildId)?.modules?.moderation?.presets; return Array.isArray(raw) ? raw.map(normalizePreset).slice(0, MAX_PRESETS) : []; }
function saveModerationPresets(guild, presets) { const data = guildManager.getGuildData(guild.id); const modules = { ...(data.modules || {}) }; modules.moderation = { ...(modules.moderation || {}), presets: presets.map(normalizePreset).slice(0, MAX_PRESETS) }; guildManager.saveGuildData(guild.id, { modules }, guild); return modules.moderation.presets; }
function getModerationPreset(guildId, presetId) { return getModerationPresets(guildId).find((preset) => preset.id === String(presetId)) || null; }
function validatePresetInput(input = {}) {
  const name = String(input.name || '').trim(); const action = String(input.action || '').trim().toLowerCase(); const reason = String(input.reason || '').trim();
  if (!name) return { error: 'Preset name is required.' }; if (!PRESET_ACTIONS.has(action)) return { error: 'Action must be warn, timeout, kick, or ban.' }; if (!reason) return { error: 'Preset reason is required.' };
  const preset = normalizePreset({ ...input, name, action, reason });
  if (action === 'warn') { const expiry = String(input.warnExpiry || 'never').trim().toLowerCase() || 'never'; if (expiry !== 'never' && !/^\d+\s*[dwm]$/.test(expiry)) return { error: 'Warning expiry must be `7d`, `2w`, `1m`, or `never`.' }; const weight = Number(input.strikeWeight || 1); if (!Number.isInteger(weight) || weight < 1 || weight > 5) return { error: 'Strike weight must be 1-5.' }; preset.warnExpiry = expiry; preset.strikeWeight = weight; }
  if (action === 'timeout') { const match = String(input.duration || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/); if (!match) return { error: 'Timeout duration must look like `10m`, `1h`, or `1d`.' }; const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }; const ms = Number(match[1]) * units[match[2]]; if (!Number.isFinite(ms) || ms <= 0 || ms > 28 * 86400000) return { error: 'Timeout duration must be greater than 0 and no more than 28 days.' }; preset.duration = String(input.duration).trim().toLowerCase(); }
  if (action === 'ban') { const days = Number(input.deleteDays || 0); if (!Number.isInteger(days) || days < 0 || days > 7) return { error: 'Ban delete-message days must be 0-7.' }; preset.deleteDays = days; }
  return { preset };
}
function upsertModerationPreset(guild, input, actorId, presetId = null) { const presets = getModerationPresets(guild.id); const existingIndex = presetId ? presets.findIndex((preset) => preset.id === presetId) : -1; if (existingIndex < 0 && presets.length >= MAX_PRESETS) return { ok: false, error: `A server can have up to ${MAX_PRESETS} moderation presets.` }; const parsed = validatePresetInput(input); if (parsed.error) return { ok: false, error: parsed.error }; const now = new Date().toISOString(); const next = existingIndex >= 0 ? { ...presets[existingIndex], ...parsed.preset, id: presets[existingIndex].id, createdBy: presets[existingIndex].createdBy, createdAt: presets[existingIndex].createdAt, updatedBy: actorId, updatedAt: now } : { ...parsed.preset, id: crypto.randomBytes(5).toString('hex'), createdBy: actorId, createdAt: now, updatedBy: actorId, updatedAt: now }; if (existingIndex >= 0) presets[existingIndex] = next; else presets.push(next); saveModerationPresets(guild, presets); return { ok: true, preset: next }; }
function deleteModerationPreset(guild, presetId) { const presets = getModerationPresets(guild.id); const next = presets.filter((preset) => preset.id !== String(presetId)); if (next.length === presets.length) return false; saveModerationPresets(guild, next); return true; }
function toggleModerationPreset(guild, presetId, actorId) { const presets = getModerationPresets(guild.id); const index = presets.findIndex((preset) => preset.id === String(presetId)); if (index < 0) return null; presets[index] = { ...presets[index], enabled: !presets[index].enabled, updatedBy: actorId, updatedAt: new Date().toISOString() }; saveModerationPresets(guild, presets); return presets[index]; }
function markPresetUsed(guild, presetId, actorId) { const presets = getModerationPresets(guild.id); const index = presets.findIndex((preset) => preset.id === String(presetId)); if (index < 0) return null; presets[index] = { ...presets[index], usageCount: presets[index].usageCount + 1, lastUsedAt: new Date().toISOString(), lastUsedBy: actorId || null }; saveModerationPresets(guild, presets); return presets[index]; }
function buildPresetManagerPayload(guild, targetId = 'none') { const presets = getModerationPresets(guild.id); const embed = createEmbed({ title: '📋 Moderation Presets', description: presets.length ? `Reusable moderation templates for **${guild.name}**.` : 'No moderation presets exist yet.', color: COLORS.PRIMARY, fields: [{ name: 'Stored', value: `${presets.length}/${MAX_PRESETS}`, inline: true }, { name: 'Selected Member', value: targetId !== 'none' ? `<@${targetId}>` : 'None', inline: true }, { name: 'Safety', value: 'Presets still use normal authority, hierarchy, validation, confirmation, logging and appeal safeguards.', inline: false }] }); const rows = []; if (presets.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_preset_select:${targetId}`).setPlaceholder('Select a moderation preset').addOptions(presets.map((preset) => ({ label: preset.name.slice(0, 100), value: preset.id, description: `${preset.enabled ? 'Enabled' : 'Disabled'} • ${preset.action} • ${preset.usageCount} uses`.slice(0, 100) }))))); rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_preset_create:${targetId}`).setLabel('➕ Create Preset').setStyle(ButtonStyle.Primary).setDisabled(presets.length >= MAX_PRESETS), new ButtonBuilder().setCustomId(targetId !== 'none' ? `mod_dashboard:${targetId}:actions` : 'mod:overview').setLabel(targetId !== 'none' ? '← Actions' : '← Moderation').setStyle(ButtonStyle.Secondary))); return { embeds: [embed], components: rows }; }
function buildPresetDetailPayload(guild, preset, targetId = 'none') { const detail = preset.action === 'warn' ? `Weight **${preset.strikeWeight}** • Expiry **${preset.warnExpiry}**` : preset.action === 'timeout' ? `Duration **${preset.duration}**` : preset.action === 'ban' ? `Delete days **${preset.deleteDays}**` : 'No additional action settings'; const embed = createEmbed({ title: `📋 ${preset.name}`, description: `Action: **${preset.action.toUpperCase()}** • ${preset.enabled ? 'Enabled ✅' : 'Disabled ⛔'}`, color: COLORS.PRIMARY, fields: [{ name: 'Reason', value: preset.reason, inline: false }, { name: 'Settings', value: detail, inline: false }, { name: 'Usage', value: `**${preset.usageCount}** submissions${preset.lastUsedAt ? ` • last used ${timestamp(new Date(preset.lastUsedAt).getTime())}` : ''}`, inline: false }, { name: 'Selected Member', value: targetId !== 'none' ? `<@${targetId}>` : 'None selected', inline: false }] }); return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_preset_apply:${preset.id}:${targetId}`).setLabel('▶ Apply').setStyle(ButtonStyle.Success).setDisabled(!preset.enabled || targetId === 'none'), new ButtonBuilder().setCustomId(`mod_preset_edit:${preset.id}:${targetId}`).setLabel('✏️ Edit').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`mod_preset_toggle:${preset.id}:${targetId}`).setLabel(preset.enabled ? '⏸ Disable' : '▶ Enable').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`mod_preset_delete:${preset.id}:${targetId}`).setLabel('🗑 Delete').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`mod_presets:${targetId}`).setLabel('← Presets').setStyle(ButtonStyle.Secondary))] }; }
function buildPresetEditorModal(preset = null, targetId = 'none') { const value = preset || normalizePreset({ name: '', action: 'warn', reason: '', warnExpiry: 'never', strikeWeight: 1 }); const secondary = value.action === 'warn' ? value.warnExpiry : value.action === 'timeout' ? value.duration : ''; const numeric = value.action === 'warn' ? String(value.strikeWeight) : value.action === 'ban' ? String(value.deleteDays) : ''; return new ModalBuilder().setCustomId(`mod_preset_save:${preset?.id || 'new'}:${targetId}`).setTitle(preset ? 'Edit Moderation Preset' : 'Create Moderation Preset').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Preset Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(String(value.name || '').slice(0, 80))), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('action').setLabel('Action: warn / timeout / kick / ban').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(String(value.action || 'warn'))), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(String(value.reason || '').slice(0, 500))), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('secondary').setLabel('Warn expiry OR timeout duration').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('warn: 7d/2w/1m/never • timeout: 1h').setValue(String(secondary || '').slice(0, 10))), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('numeric').setLabel('Warn weight (1-5) OR ban delete days (0-7)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1).setValue(String(numeric || '').slice(0, 1)))); }
function buildPresetExecutionModal(preset, targetId) { const suffix = `:preset:${preset.id}`; if (preset.action === 'warn') return new ModalBuilder().setCustomId(`mod_submit_warn:${targetId}${suffix}`).setTitle(`Warn • ${preset.name}`.slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('strike_weight').setLabel('Strike weight (1-5)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1).setValue(String(preset.strikeWeight))), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('warn_expiry').setLabel('Warn expiry (7d, 2w, 1m, or never)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(preset.warnExpiry)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(preset.reason))); const modal = new ModalBuilder().setCustomId(`mod_submit_${preset.action}:${targetId}${suffix}`).setTitle(`${preset.action[0].toUpperCase()}${preset.action.slice(1)} • ${preset.name}`.slice(0, 45)); const rows = []; if (preset.action === 'ban') rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Delete message days (0-7)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setValue(String(preset.deleteDays)))); if (preset.action === 'timeout') rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duration (10m, 1h, 1d)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(preset.duration))); rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(preset.reason))); return modal.addComponents(...rows); }
function presetIdFromSubmission(customId) { const match = String(customId || '').match(/:preset:([a-f0-9]{6,24})$/i); return match ? match[1] : null; }

function parseJsonValue(value) { if (value === null || value === undefined || value === '') return null; try { return JSON.parse(value); } catch { return value; } }
function normalizeExportInclude(raw) { const tokens = String(raw || 'all').toLowerCase().split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean); if (!tokens.length || tokens.includes('all')) return new Set(EXPORT_INCLUDE_KEYS); const invalid = tokens.filter((value) => !EXPORT_INCLUDE_KEYS.has(value)); if (invalid.length) return { error: `Unknown include option: ${invalid.join(', ')}` }; const include = new Set(tokens); include.add('core'); return include; }
function parseExportDate(raw, endOfDay = false) { const value = String(raw || '').trim(); if (!value) return null; const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value); const parsed = new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : dateOnly ? `${value}T00:00:00.000Z` : value); return Number.isFinite(parsed.getTime()) ? parsed.getTime() : NaN; }
function parseExportFilters(raw) { const filters = {}; const pattern = /(action|status|from|to):("[^"]*"|'[^']*'|\S+)/gi; let match; while ((match = pattern.exec(String(raw || '')))) { const key = match[1].toLowerCase(); const value = String(match[2] || '').replace(/^("|')|("|')$/g, '').trim(); if (value) filters[key] = value; } if (filters.from) { filters.fromMs = parseExportDate(filters.from, false); if (!Number.isFinite(filters.fromMs)) return { error: 'Export `from` date is invalid.' }; } if (filters.to) { filters.toMs = parseExportDate(filters.to, true); if (!Number.isFinite(filters.toMs)) return { error: 'Export `to` date is invalid.' }; } if (filters.fromMs && filters.toMs && filters.fromMs > filters.toMs) return { error: '`from` date must be before `to` date.' }; return { filters }; }
function buildExportModal(targetId = 'none') { const hasTarget = targetId && targetId !== 'none'; return new ModalBuilder().setCustomId(`mod_export_submit:${targetId || 'none'}`).setTitle('Export Moderation Data').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('scope').setLabel('Scope: all / user / moderator / case').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(hasTarget ? 'user' : 'all')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reference').setLabel('User / moderator / case ID').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setValue(hasTarget ? targetId : '')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('filters').setLabel('Optional filters').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('action:warn status:active from:2026-08-01 to:2026-08-29')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('format').setLabel('Format: json / csv').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setValue('json')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('include').setLabel('Include: all or comma-separated sections').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('core,metadata,appeals,evidence,audit').setValue('all'))); }
function parseExportRequest(interaction) { const scope = String(interaction.fields.getTextInputValue('scope') || '').trim().toLowerCase(); const reference = String(interaction.fields.getTextInputValue('reference') || '').trim(); const format = String(interaction.fields.getTextInputValue('format') || '').trim().toLowerCase(); if (!EXPORT_SCOPES.has(scope)) return { error: 'Scope must be `all`, `user`, `moderator`, or `case`.' }; if (!EXPORT_FORMATS.has(format)) return { error: 'Format must be `json` or `csv`.' }; if (scope === 'case' && !/^\d{1,12}$/.test(reference)) return { error: 'Case scope requires a numeric Case ID.' }; if ((scope === 'user' || scope === 'moderator') && !/^\d{16,20}$/.test(reference)) return { error: `${scope} scope requires a valid Discord ID.` }; const parsedFilters = parseExportFilters(interaction.fields.getTextInputValue('filters')); if (parsedFilters.error) return parsedFilters; const include = normalizeExportInclude(interaction.fields.getTextInputValue('include')); if (include?.error) return include; return { scope, reference, format, filters: parsedFilters.filters, include }; }
function selectExportCases(guildId, request) { let cases = getAllCases(guildId) || []; if (request.scope === 'user') cases = cases.filter((entry) => String(entry.userId) === request.reference); if (request.scope === 'moderator') cases = cases.filter((entry) => String(entry.moderatorId) === request.reference); if (request.scope === 'case') cases = cases.filter((entry) => Number(entry.caseId) === Number(request.reference)); if (request.filters.action) cases = cases.filter((entry) => String(entry.action || '').toLowerCase() === request.filters.action.toLowerCase()); if (request.filters.status) cases = cases.filter((entry) => String(entry.status || 'active').toLowerCase() === request.filters.status.toLowerCase()); if (request.filters.fromMs) cases = cases.filter((entry) => getCaseTime(entry) >= request.filters.fromMs); if (request.filters.toMs) cases = cases.filter((entry) => getCaseTime(entry) <= request.filters.toMs); return cases.sort((a, b) => Number(a.caseId) - Number(b.caseId)); }
function exportAuditMap(guildId, caseIds) { const wanted = new Set(caseIds.map(Number)); const map = new Map(); if (!wanted.size) return map; try { const rows = db.prepare('SELECT * FROM case_audit WHERE guild_id = ? ORDER BY audit_id ASC').all(String(guildId)); for (const row of rows) { if (!wanted.has(Number(row.case_id))) continue; const value = { auditId: row.audit_id, actorId: row.actor_id || null, event: row.event, before: parseJsonValue(row.before_value), after: parseJsonValue(row.after_value), metadata: parseJsonValue(row.metadata) || {}, createdAt: row.created_at }; if (!map.has(Number(row.case_id))) map.set(Number(row.case_id), []); map.get(Number(row.case_id)).push(value); } } catch (error) { console.error('❌ Moderation export audit query failed:', error); } return map; }
function buildExportRecords(guildId, cases, include) { const auditMap = include.has('audit') ? exportAuditMap(guildId, cases.map((entry) => entry.caseId)) : new Map(); return cases.map((entry) => { const record = { caseId: entry.caseId, guildId: entry.guildId, userId: entry.userId, moderatorId: entry.moderatorId, action: entry.action, reason: entry.reason, status: entry.status || 'active', relatedCaseId: entry.relatedCaseId || null, note: entry.note || null, createdAt: entry.createdAt, updatedAt: entry.updatedAt || null }; if (include.has('metadata')) record.metadata = entry.metadata || {}; if (include.has('appeals')) record.appeals = getCaseAppeals(entry); if (include.has('evidence')) record.evidence = Array.isArray(entry?.metadata?.evidence) ? entry.metadata.evidence : []; if (include.has('audit')) record.audit = auditMap.get(Number(entry.caseId)) || []; return record; }); }
function csvEscape(value) { if (value === null || value === undefined) return ''; const text = typeof value === 'string' ? value : JSON.stringify(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function exportCsvRows(records, include) { const columns = ['caseId', 'guildId', 'userId', 'moderatorId', 'action', 'status', 'reason', 'relatedCaseId', 'note', 'createdAt', 'updatedAt']; if (include.has('metadata')) columns.push('metadata'); if (include.has('appeals')) columns.push('appeals'); if (include.has('evidence')) columns.push('evidence'); if (include.has('audit')) columns.push('audit'); return { header: columns.join(','), rows: records.map((record) => columns.map((column) => csvEscape(record[column])).join(',')) }; }
function safeExportName(guildId, format, part, total) { const stamp = new Date().toISOString().replace(/[:.]/g, '-'); return `goliath-mod-export-${guildId}-${stamp}${total > 1 ? `-part-${part}` : ''}.${format}`; }
function makeExportAttachments(guildId, format, records, include, request) { const chunks = []; if (format === 'csv') { const { header, rows } = exportCsvRows(records, include); let current = `${header}\n`; for (const row of rows) { const next = `${row}\n`; if (Buffer.byteLength(next, 'utf8') > MAX_EXPORT_FILE_BYTES) return { error: 'A single export row exceeds the attachment size limit. Narrow the export scope.' }; if (Buffer.byteLength(current + next, 'utf8') > MAX_EXPORT_FILE_BYTES && current !== `${header}\n`) { chunks.push(current); current = `${header}\n${next}`; } else current += next; } chunks.push(current); } else { const header = { version: 1, generatedAt: new Date().toISOString(), guildId: String(guildId), request: { scope: request.scope, reference: request.reference || null, filters: request.filters, include: [...include] } }; let currentRecords = []; for (const record of records) { const candidate = JSON.stringify({ ...header, records: [...currentRecords, record] }, null, 2); if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_EXPORT_FILE_BYTES) return { error: 'A single case record exceeds the attachment size limit. Exclude audit/evidence or narrow the export.' }; if (Buffer.byteLength(candidate, 'utf8') > MAX_EXPORT_FILE_BYTES && currentRecords.length) { chunks.push(JSON.stringify({ ...header, records: currentRecords }, null, 2)); currentRecords = [record]; } else currentRecords.push(record); } chunks.push(JSON.stringify({ ...header, records: currentRecords }, null, 2)); } if (chunks.length > MAX_EXPORT_ATTACHMENTS) return { error: `Export requires ${chunks.length} attachments. Narrow the scope or exclude audit/evidence (maximum ${MAX_EXPORT_ATTACHMENTS}).` }; return { attachments: chunks.map((content, index) => new AttachmentBuilder(Buffer.from(content, 'utf8'), { name: safeExportName(guildId, format, index + 1, chunks.length) })) }; }
async function handleExportInteraction(interaction) { const id = String(interaction.customId || ''); if (interaction.isButton?.() && id.startsWith('mod_export_cases:')) { if (!canUseModAction(interaction.member, interaction.guild, 'export_cases')) return safeReply(interaction, ephemeralError('No permission to export moderation data.')); const [, targetId = 'none'] = id.split(':'); await interaction.showModal(buildExportModal(targetId)); return true; } if (interaction.isModalSubmit?.() && id.startsWith('mod_export_submit:')) { if (!canUseModAction(interaction.member, interaction.guild, 'export_cases')) return safeReply(interaction, ephemeralError('No permission to export moderation data.')); const request = parseExportRequest(interaction); if (request.error) return safeReply(interaction, ephemeralError(request.error)); const cases = selectExportCases(interaction.guild.id, request); if (!cases.length) return safeReply(interaction, ephemeralError('No moderation cases matched the export request.')); if (cases.length > MAX_EXPORT_CASES) return safeReply(interaction, ephemeralError(`Export matched ${cases.length} cases. Narrow the scope to ${MAX_EXPORT_CASES} cases or fewer.`)); const records = buildExportRecords(interaction.guild.id, cases, request.include); const generated = makeExportAttachments(interaction.guild.id, request.format, records, request.include, request); if (generated.error) return safeReply(interaction, ephemeralError(generated.error)); return safeReply(interaction, { content: `📤 Export ready • **${records.length}** case${records.length === 1 ? '' : 's'} • **${request.format.toUpperCase()}** • ${generated.attachments.length} attachment${generated.attachments.length === 1 ? '' : 's'}\nGenerated in memory only; no export file was persisted by Goliath.`, files: generated.attachments, flags: 64 }); } return false; }

function buttonRow(buttons) { return buttons.length ? new ActionRowBuilder().addComponents(buttons) : null; }
function buildDashboardNav(targetId, activeView, member, guild) {
  const active = normalizeView(activeView);
  const id = targetId || 'none';
  const rows = [];

  if (targetId) {
    const candidates = [
      ['member', '👤 Member'],
      ['actions', '⚡ Actions'],
      ['intelligence', '🧠 Intel'],
      ['cases', '📁 Cases'],
    ].filter(([view]) => view !== active && canViewDashboardSection(member, guild, view));

    const buttons = candidates.slice(0, 4).map(([view, label]) => new ButtonBuilder()
      .setCustomId(`mod_dashboard:${id}:${view}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary));
    if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}
function buildUserSelectRow() { return new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('mod_user_select').setPlaceholder('👤 Select a member to investigate or moderate').setMinValues(1).setMaxValues(1)); }
function actionPermissions(member, guild) { return { warn: canUseModAction(member, guild, 'warn'), timeout: canUseModAction(member, guild, 'timeout'), kick: canUseModAction(member, guild, 'kick'), ban: canUseModAction(member, guild, 'ban'), removeWarning: canUseModAction(member, guild, 'remove_warning'), removeTimeout: canUseModAction(member, guild, 'remove_timeout') }; }
function buildActionRows(target, stats, member, guild) {
  const id = target?.id || 'none';
  const p = actionPermissions(member, guild);
  const disabled = !target;
  const apply = [];

  if (p.warn) apply.push(createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️')).setDisabled(disabled));
  if (p.timeout) apply.push(createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳')).setDisabled(disabled));
  if (p.kick) apply.push(createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢')).setDisabled(disabled));
  if (p.ban) apply.push(createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨')).setDisabled(disabled));

  const reverse = [];
  if (target && p.removeWarning && Number(stats?.warningCount || 0) > 0) reverse.push(createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warn', getEmoji('DELETE', '🗑️')));
  if (target && p.removeTimeout && targetHasActiveTimeout(target)) reverse.push(createSecondaryButton(`mod_remove_timeout:${id}`, 'Clear Timeout', getEmoji('SUCCESS', '✅')));

  return [buttonRow(apply), buttonRow(reverse)].filter(Boolean);
}
function buildIntelligenceRows(targetId, member, guild) {
  if (!targetId) return [];
  const id = targetId; const rows = []; const first = [];
  if (canUseModAction(member, guild, 'scan_run')) first.push(createPrimaryButton(`mod_member_scan:${id}`, 'Full Member Scan', '🔎'));
  if (canUseModAction(member, guild, 'scan_history')) first.push(createSecondaryButton(`mod_scan_history:${id}`, 'Scan History', '📜'));
  if (canUseModAction(member, guild, 'scan_compare')) first.push(createSecondaryButton(`mod_scan_compare:${id}`, 'Compare', '⚖️'));
  if (canUseModAction(member, guild, 'scan_links')) first.push(createSecondaryButton(`mod_scan_links:${id}`, 'Link Evidence', '🔗'));
  const second = [];
  if (canUseModAction(member, guild, 'scan_notes')) second.push(createSecondaryButton(`mod_scan_note:${id}`, 'Add Note', '📝'));
  if (canUseModAction(member, guild, 'scan_watch')) second.push(createSecondaryButton(`mod_scan_watch:${id}`, 'Watch Status', '👁️'));
  for (const row of [buttonRow(first), buttonRow(second)]) if (row) rows.push(row);
  return rows;
}
function validateDashboardComponents(components, view) {
  if (components.length > 5) throw new Error(`Moderation ${view} workspace produced ${components.length} component rows; Discord allows 5.`);
  for (const row of components) if (Array.isArray(row?.components) && row.components.length > 5) throw new Error(`Moderation ${view} workspace produced a row with ${row.components.length} components; Discord allows 5.`);
  return components;
}

function buildMemberEmbed(interaction, target, stats, staffDisplay) {
  const overall = workspaceStats(interaction.guild.id);
  if (!target) return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('🛡️ Goliath Moderation')
    .setDescription([
      'Moderate members, review intelligence and manage cases from one focused workspace.',
      '',
      `**Authority:** ${staffDisplay}`,
      '',
      'Select a member below. The moderation buttons underneath become available immediately.',
    ].join('\n'))
    .addFields(
      { name: 'Open Cases', value: `**${overall.activeCases}**`, inline: true },
      { name: 'Active Warnings', value: `**${overall.activeWarnings}**`, inline: true },
      { name: 'Pending Appeals', value: `**${overall.pendingAppeals}**`, inline: true },
    );

  const highestRole = target.roles?.highest && target.roles.highest.id !== interaction.guild.id ? `${target.roles.highest}` : 'No elevated role';
  const timeout = targetHasActiveTimeout(target) ? `Active until ${timestamp(target.communicationDisabledUntilTimestamp, 'f')}` : 'None';
  const embed = baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle(`👤 Member Workspace • ${target.user?.tag || target.user?.username || target.id}`)
    .setDescription([`${target.user} is the active moderation target.`, '', 'Use **Actions**, **Intel** and **Cases** below. The selected member stays active while you move between these views.'].join('\n'))
    .addFields(
      { name: 'Identity', value: `**Discord ID:** \`${target.id}\`\n**Account Created:** ${timestamp(target.user?.createdTimestamp)}\n**Joined Server:** ${timestamp(target.joinedTimestamp)}`, inline: false },
      { name: 'Server Position', value: `**Highest Role:** ${highestRole}\n**Timeout:** ${timeout}`, inline: true },
      { name: 'Moderation', value: `**Warnings:** ${stats.warningCount ?? 0}\n**Cases:** ${stats.caseCount ?? 0}`, inline: true },
      { name: 'Latest Case', value: stats.lastCaseSummary || 'No cases found.', inline: false },
    );
  const avatar = target.user?.displayAvatarURL?.({ size: 256 });
  if (avatar) embed.setThumbnail(avatar);
  return embed;
}
function buildActionsEmbed(interaction, target, stats) {
  if (!target) return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('⚡ Moderation Actions')
    .setDescription(['**No member selected.**', '', 'Return to Moderation Home and choose a member first.'].join('\n'));

  const timeout = targetHasActiveTimeout(target) ? `Active until ${timestamp(target.communicationDisabledUntilTimestamp, 'f')}` : 'None';
  return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('⚡ Moderation Actions')
    .setDescription([`**Active Member:** ${target.user}`, `**Discord ID:** \`${target.id}\``, '', 'Choose an action below. Reversal controls appear only when there is an active warning or timeout to clear.'].join('\n'))
    .addFields(
      { name: 'Warnings', value: `**${stats?.warningCount ?? 0}**`, inline: true },
      { name: 'Timeout', value: `**${timeout}**`, inline: true },
      { name: 'Safety Checks', value: 'Authority, Discord hierarchy, target safety and confirmation requirements are rechecked when the action is submitted.', inline: false },
    );
}
function buildIntelligenceEmbed(interaction, target, member, guild) { const capabilities = []; if (canUseModAction(member, guild, 'scan_suspects')) capabilities.push('Suspected-account correlation'); if (canUseModAction(member, guild, 'scan_network')) capabilities.push('Goliath network intelligence'); if (canUseModAction(member, guild, 'scan_links')) capabilities.push('Persistent link evidence'); if (canUseModAction(member, guild, 'scan_notes')) capabilities.push('Investigation notes'); if (canUseModAction(member, guild, 'scan_watch')) capabilities.push('Watch status'); return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('🧠 Member Intelligence').setDescription([target ? `**Active Member:** ${target.user} • \`${target.id}\`` : '**No member selected.**', '', 'Run Goliath Intelligence Scan to assemble the information this viewer is authorized to access.', '', capabilities.length ? `**Available Intelligence:**\n${capabilities.map((value) => `• ${value}`).join('\n')}` : 'Your authority profile provides basic scan access only.', '', 'Correlation results are evidence-led and never presented as confirmed identity unless Goliath has verified evidence.'].join('\n')); }
function buildCasesEmbed(target, cases = [], page = 0, totalPages = 1, actionFilter = 'all', statusFilter = 'all') { const description = cases.length ? cases.map((entry) => `**#${entry.caseId}** • ${String(entry.action || 'unknown').toUpperCase()} • ${getStatusLabel(entry)}\n${entry.reason || 'No reason provided'}\n<t:${Math.floor(getCaseTime(entry) / 1000)}:R>`).join('\n\n') : 'No cases found for this member.'; return createEmbed({ title: target?.user?.tag ? `📁 Cases • ${target.user.tag}` : '📁 Member Cases', description, color: COLORS.PRIMARY, footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1}/${totalPages}` }); }
function buildAnalyticsOverviewEmbed(guild, analytics) { const trend = analytics.trend.map((entry) => `${entry.label}: **${entry.count}**`).join(' • '); const topModerators = analytics.topModerators.length ? analytics.topModerators.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderator activity.'; const topUsers = analytics.topUsers.length ? analytics.topUsers.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderated members.'; const appeal = analytics.appealCounts; const changeText = analytics.change === null ? 'No previous-period baseline' : `${analytics.change >= 0 ? '+' : ''}${analytics.change}% vs previous period`; return createEmbed({ title: `📊 Moderation Analytics • ${analytics.windowLabel}`, description: `Stats for **${guild?.name || 'this server'}**\n${changeText}`, color: COLORS.PRIMARY, fields: [{ name: 'Cases', value: `Total **${analytics.totalCases}** • Active **${analytics.activeCases}** • Reversed **${analytics.reversedCases}** • Expired **${analytics.expiredCases}**`, inline: false }, { name: 'Actions', value: formatActionBreakdown(analytics.actionCounts), inline: false }, { name: 'Members', value: `Unique **${analytics.uniqueUsers}** • Repeat offenders **${analytics.repeatOffenders}**`, inline: true }, { name: 'Reversal Rate', value: analytics.reversalRate, inline: true }, { name: 'Audit Activity', value: `${analytics.auditActions} events`, inline: true }, { name: 'Appeals', value: `Pending **${appeal.pending}** • Approved **${appeal.approved}** • Denied **${appeal.denied}** • Approval rate **${analytics.appealApprovalRate}**`, inline: false }, { name: 'Top Moderators', value: topModerators.slice(0, 1024), inline: true }, { name: 'Frequent Members', value: topUsers.slice(0, 1024), inline: true }, { name: 'Recent Daily Trend', value: trend || 'No recent cases.', inline: false }], footer: 'Recorded moderation activity only — not a staff quality score.' }); }
function buildModeratorAnalyticsEmbed(guild, analytics) { const appeals = analytics.moderatorAppeals; const recentCases = analytics.recentCases.length ? analytics.recentCases.map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • <@${entry.userId}>`).join('\n') : 'No cases in this period.'; const auditEvents = analytics.topAuditEvents.length ? analytics.topAuditEvents.map(([event, count]) => `${String(event).replace(/^case\./, '')}: **${count}**`).join('\n') : 'No audited activity.'; return createEmbed({ title: `👤 Moderator History • ${analytics.windowLabel}`, description: `Moderator <@${analytics.moderatorId}> • ${guild?.name || 'Server'}`, color: COLORS.PRIMARY, fields: [{ name: 'Case Activity', value: `Cases **${analytics.moderatorCases}** • Affected members **${analytics.affectedUsers}** • Repeat targets **${analytics.repeatTargets}**`, inline: false }, { name: 'Actions', value: formatActionBreakdown(analytics.moderatorActionCounts), inline: false }, { name: 'Case Outcomes', value: `Active **${analytics.moderatorStatusCounts.active || 0}** • Reversed **${analytics.moderatorStatusCounts.reversed || 0}** • Expired **${analytics.moderatorStatusCounts.expired || 0}** • Reversal rate **${analytics.moderatorReversalRate}**`, inline: false }, { name: 'Appeals on Their Cases', value: `Pending **${appeals.pending}** • Approved **${appeals.approved}** • Denied **${appeals.denied}** • Approval rate **${analytics.moderatorAppealApprovalRate}**`, inline: false }, { name: 'Audited Activity', value: `**${analytics.moderatorAuditActions}** events`, inline: true }, { name: 'Top Audit Events', value: auditEvents.slice(0, 1024), inline: true }, { name: 'Recent Cases', value: recentCases.slice(0, 1024), inline: false }], footer: 'Recorded moderation activity only — not a staff quality score.' }); }
function buildAnalyticsRows(windowKey, mode = 'overview', moderatorId = null, currentUserId = null) { const window = normalizeAnalyticsWindow(windowKey); return [new ActionRowBuilder().addComponents(Object.keys(ANALYTICS_WINDOWS).map((key) => new ButtonBuilder().setCustomId(`mod_analytics_window:${key}:${mode}:${moderatorId || 'none'}`).setLabel(ANALYTICS_WINDOW_LABELS[key]).setStyle(window === key ? ButtonStyle.Primary : ButtonStyle.Secondary))), new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`mod_analytics_moderator_select:${window}`).setPlaceholder('👤 Select moderator for history').setMinValues(1).setMaxValues(1)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_analytics_overview:${window}`).setLabel('📊 Server').setStyle(mode === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`mod_analytics_my:${window}:${currentUserId || 'none'}`).setLabel('👤 My History').setStyle(mode === 'moderator' && moderatorId === currentUserId ? ButtonStyle.Primary : ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`mod_analytics_refresh:${window}:${mode}:${moderatorId || 'none'}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mod_case_appeal_queue:0').setLabel('⚖️ Appeal Queue').setStyle(ButtonStyle.Secondary))]; }
function buildTargetStats(guildId, target) { if (!target) return { warningCount: undefined, caseCount: undefined, lastCaseSummary: null }; const cases = getCasesForUser(guildId, target.id) || []; return { warningCount: getWarningCountForUser(guildId, target.id), caseCount: getCaseCountForUser(guildId, target.id), lastCaseSummary: cases[0] ? formatCaseSummary(cases[0]) : null }; }
function getCasesPageData(guildId, targetId, options = {}) { const actionFilter = options.actionFilter || 'all'; const statusFilter = options.statusFilter || 'all'; const filters = {}; if (actionFilter !== 'all') filters.action = actionFilter; if (statusFilter !== 'all') filters.status = statusFilter; const allCases = getFilteredCases(guildId, targetId, filters) || []; const totalPages = Math.max(1, Math.ceil(allCases.length / CASES_PER_PAGE)); const page = Math.max(0, Math.min(Number(options.page) || 0, totalPages - 1)); return { actionFilter, statusFilter, page, totalPages, pageCases: allCases.slice(page * CASES_PER_PAGE, (page + 1) * CASES_PER_PAGE) }; }

async function buildDashboardPayload(discord, interaction, target, view = DEFAULT_VIEW, options = {}) {
  await syncExpiredWarningsToCases(interaction.guild.id);
  const context = normalizeDashboardContext({ ...options, view }); let safeView = context.view;
  if (!canViewDashboardSection(interaction.member, interaction.guild, safeView)) safeView = DEFAULT_VIEW;
  const targetId = target?.id || null; const stats = buildTargetStats(interaction.guild.id, target); const staff = getStaffDisplay(interaction.member, interaction.guild); const staffDisplay = `${staff.badge} ${staff.label} • ${interaction.member}`;
  const embeds = []; const components = [buildUserSelectRow()];
  if (safeView === 'member') { embeds.push(buildMemberEmbed(interaction, target, stats, staffDisplay)); components.push(...buildActionRows(target, stats, interaction.member, interaction.guild)); }
  else if (safeView === 'actions') { embeds.push(buildActionsEmbed(interaction, target, stats)); components.push(...buildActionRows(target, stats, interaction.member, interaction.guild)); }
  else if (safeView === 'intelligence') { embeds.push(buildIntelligenceEmbed(interaction, target, interaction.member, interaction.guild)); components.push(...buildIntelligenceRows(targetId, interaction.member, interaction.guild)); }
  else if (safeView === 'cases') { if (!target) { embeds.push(baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('📁 Member Cases').setDescription('Select a member to open their case workspace.')); } else { const pageData = getCasesPageData(interaction.guild.id, target.id, context); embeds.push(buildCasesEmbed(target, pageData.pageCases, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter)); components.push(...buildCasesPageButtons(target.id, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter), ...buildCaseFilterButtons(target.id, pageData.actionFilter, pageData.statusFilter, pageData.page)); } }
  else if (safeView === 'analytics') { const window = context.analyticsWindow; if (context.analyticsMode === 'moderator' && context.analyticsModeratorId) embeds.push(buildModeratorAnalyticsEmbed(interaction.guild, getModeratorAnalytics(interaction.guild.id, context.analyticsModeratorId, window))); else embeds.push(buildAnalyticsOverviewEmbed(interaction.guild, getModerationAnalytics(interaction.guild.id, window))); components.push(...buildAnalyticsRows(window, context.analyticsMode, context.analyticsModeratorId, interaction.user?.id || null)); }
  components.push(...buildDashboardNav(targetId, safeView, interaction.member, interaction.guild));
  return { embeds, components: validateDashboardComponents(components, safeView) };
}
async function renderDashboard(interaction, targetId, view = DEFAULT_VIEW, context = {}) { const requestedView = normalizeView(view); if (!canViewDashboardSection(interaction.member, interaction.guild, requestedView)) return safeReply(interaction, ephemeralError('That moderation workspace is not available to your authority profile.')); const target = targetId && targetId !== 'none' ? await fetchTarget(interaction.guild, targetId) : null; if (targetId && targetId !== 'none' && !target) return safeReply(interaction, ephemeralError('Could not find the selected member.')); await interaction.update(await buildDashboardPayload(Discord, interaction, target, requestedView, context)); return true; }
async function refreshDashboard(discord, interaction, target, context = {}) { const safeContext = normalizeDashboardContext(context); const payload = await buildDashboardPayload(discord, interaction, target, safeContext.view, safeContext); try { if (interaction.message) { await interaction.message.edit(payload); return true; } if (interaction.replied || interaction.deferred) { await interaction.editReply(payload); return true; } await interaction.reply({ ...payload, flags: 64 }); return true; } catch (error) { console.error('❌ Failed to refresh moderation dashboard message:', error); return false; } }
async function refreshCasesDashboard(interaction, target) {
  if (!target) return false;
  const id = String(interaction?.customId || '');
  const returnsToActions = id.startsWith('mod_submit_warn:') || id.startsWith('mod_submit_timeout:');
  return refreshDashboard(Discord, interaction, target, returnsToActions ? DEFAULT_ACTIONS_CONTEXT : DEFAULT_CASES_CONTEXT);
}
async function handleDashboardNavigation(interaction) {
  const id = String(interaction.customId || '');
  if (id === 'mod:overview') return renderDashboard(interaction, 'none', 'member');
  if (id.startsWith('mod_analytics_') && !canViewDashboardSection(interaction.member, interaction.guild, 'analytics')) return safeReply(interaction, ephemeralError('No permission to view moderation analytics.'));
  if (id.startsWith('mod_analytics_window:')) { const [, window, mode = 'overview', moderatorId = 'none'] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId }); }
  if (id.startsWith('mod_analytics_overview:')) { const [, window] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'overview' }); }
  if (id.startsWith('mod_analytics_my:')) { const [, window, moderatorId] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId }); }
  if (id.startsWith('mod_analytics_refresh:')) { const [, window, mode, moderatorId = 'none'] = id.split(':'); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId }); }
  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) { const [, targetId = 'none', requested = DEFAULT_VIEW] = id.split(':'); return renderDashboard(interaction, targetId, requested, normalizeView(requested) === 'analytics' ? DEFAULT_ANALYTICS_CONTEXT : {}); }
  if (id.startsWith('mod_filter_cases:') || id.startsWith('mod_case_page:')) { if (!canViewDashboardSection(interaction.member, interaction.guild, 'cases')) return safeReply(interaction, ephemeralError('No permission to view moderation cases.')); const [, targetId = 'none', actionFilter = 'all', statusFilter = 'all', page = '0'] = id.split(':'); return renderDashboard(interaction, targetId, 'cases', { actionFilter, statusFilter, page }); }
  return false;
}
async function handleUserSelectMenu(interaction) { if (String(interaction.customId || '').startsWith('mod_analytics_moderator_select:')) { if (!canUseModAction(interaction.member, interaction.guild, 'view_analytics')) return safeReply(interaction, ephemeralError('No permission to view moderation analytics.')); const [, window] = String(interaction.customId).split(':'); const moderatorId = interaction.values?.[0]; if (!moderatorId) return safeReply(interaction, ephemeralError('No moderator selected.')); return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId }); } if (interaction.customId !== 'mod_user_select') return false; const target = await fetchTarget(interaction.guild, interaction.values[0]); if (!target) return safeReply(interaction, ephemeralError('Could not find that member.')); return renderDashboard(interaction, target.id, 'actions'); }
async function openPresetManager(interaction, targetId = 'none') {
  if (!canUseModAction(interaction.member, interaction.guild, 'manage_presets')) return safeReply(interaction, ephemeralError('No permission to manage moderation presets.'));
  return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 });
}
async function openExportModal(interaction, targetId = 'none') {
  if (!canUseModAction(interaction.member, interaction.guild, 'export_cases')) return safeReply(interaction, ephemeralError('No permission to export moderation data.'));
  await interaction.showModal(buildExportModal(targetId));
  return true;
}
async function handlePresetInteraction(interaction) {
  const id = String(interaction.customId || ''); const managesPresets = canUseModAction(interaction.member, interaction.guild, 'manage_presets');
  if ((id.startsWith('mod_preset_') || id.startsWith('mod_presets:')) && !managesPresets) return safeReply(interaction, ephemeralError('No permission to manage moderation presets.'));
  if (interaction.isStringSelectMenu?.() && id.startsWith('mod_preset_select:')) { const [, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, interaction.values?.[0]); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, preset, targetId), flags: 64 }); }
  if (!interaction.isButton?.()) return false;
  if (id.startsWith('mod_presets:')) { const [, targetId = 'none'] = id.split(':'); return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_create:')) { const [, targetId = 'none'] = id.split(':'); await interaction.showModal(buildPresetEditorModal(null, targetId)); return true; }
  if (id.startsWith('mod_preset_edit:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); await interaction.showModal(buildPresetEditorModal(preset, targetId)); return true; }
  if (id.startsWith('mod_preset_toggle:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = toggleModerationPreset(interaction.guild, presetId, interaction.user?.id); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, preset, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_delete_confirm:')) { const [, presetId, targetId = 'none'] = id.split(':'); if (!deleteModerationPreset(interaction.guild, presetId)) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { ...buildPresetManagerPayload(interaction.guild, targetId), flags: 64 }); }
  if (id.startsWith('mod_preset_delete:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset) return safeReply(interaction, ephemeralError('Preset not found.')); return safeReply(interaction, { content: `Delete preset **${preset.name}**?`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mod_preset_delete_confirm:${presetId}:${targetId}`).setLabel('Confirm Delete').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`mod_preset_edit:${presetId}:${targetId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary))], flags: 64 }); }
  if (id.startsWith('mod_preset_apply:')) { const [, presetId, targetId = 'none'] = id.split(':'); const preset = getModerationPreset(interaction.guild.id, presetId); if (!preset || !preset.enabled) return safeReply(interaction, ephemeralError('Preset is unavailable or disabled.')); if (targetId === 'none') return safeReply(interaction, ephemeralError('Select a moderation target first.')); if (!canUseModAction(interaction.member, interaction.guild, preset.action)) return safeReply(interaction, ephemeralError(`No permission to use ${preset.action}.`)); const target = await fetchTarget(interaction.guild, targetId); if (!target) return safeReply(interaction, ephemeralError('Could not find the selected target.')); await interaction.showModal(buildPresetExecutionModal(preset, targetId)); return true; }
  return false;
}
async function handlePresetModal(interaction) { const id = String(interaction.customId || ''); if (!id.startsWith('mod_preset_save:')) return false; if (!canUseModAction(interaction.member, interaction.guild, 'manage_presets')) return safeReply(interaction, ephemeralError('No permission to manage moderation presets.')); const [, presetIdRaw, targetId = 'none'] = id.split(':'); const presetId = presetIdRaw === 'new' ? null : presetIdRaw; const result = upsertModerationPreset(interaction.guild, { name: interaction.fields.getTextInputValue('name'), action: interaction.fields.getTextInputValue('action'), reason: interaction.fields.getTextInputValue('reason'), warnExpiry: interaction.fields.getTextInputValue('secondary') || 'never', duration: interaction.fields.getTextInputValue('secondary') || '1h', strikeWeight: interaction.fields.getTextInputValue('numeric') || 1, deleteDays: interaction.fields.getTextInputValue('numeric') || 0 }, interaction.user?.id || null, presetId); if (!result.ok) return safeReply(interaction, ephemeralError(result.error)); return safeReply(interaction, { ...buildPresetDetailPayload(interaction.guild, result.preset, targetId), flags: 64 }); }
async function openModPanel(interaction, options = {}) { if (!canOpenModPanel(interaction)) return interaction.deferred || interaction.replied ? interaction.editReply(noAccessPayload()) : interaction.reply(noAccessPayload()); const view = normalizeView(options.view || DEFAULT_VIEW); const target = options.target || null; const payload = await buildDashboardPayload(Discord, interaction, target, view, options); const finalPayload = { ...payload, flags: 64 }; return interaction.deferred || interaction.replied ? interaction.editReply(finalPayload) : interaction.reply(finalPayload); }

module.exports = {
  openModPanel,
  renderDashboard,
  openPresetManager,
  openExportModal,
  refreshDashboard,
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handlePresetInteraction,
  handlePresetModal,
  handleExportInteraction,
  presetIdFromSubmission,
  markPresetUsed,
  getModerationAnalytics,
  getModeratorAnalytics,
  getModerationPresets,
  getModerationPreset,
};
