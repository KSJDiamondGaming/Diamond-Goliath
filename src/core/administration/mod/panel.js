'use strict';

const Discord = require('discord.js');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} = Discord;

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
const {
  getWarningCountForUser,
  syncExpiredWarningsToCases,
} = require('./warns');
const {
  canUseModAction,
  getStaffDisplay,
  hasModPermission,
  fetchTarget,
} = require('./permissions');

const DEFAULT_VIEW = 'overview';
const CASES_PER_PAGE = 5;
const ALLOWED_VIEWS = new Set(['overview', 'actions', 'cases', 'tools', 'analytics']);
const ANALYTICS_WINDOWS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });
const ANALYTICS_WINDOW_LABELS = Object.freeze({ '7d': '7 Days', '30d': '30 Days', '90d': '90 Days', all: 'All Time' });
const DEFAULT_CASES_CONTEXT = Object.freeze({ view: 'cases', actionFilter: 'all', statusFilter: 'all', page: 0 });
const DEFAULT_ANALYTICS_CONTEXT = Object.freeze({ view: 'analytics', analyticsWindow: '30d', analyticsMode: 'overview', analyticsModeratorId: null });

function canOpenModPanel(interaction) {
  return Boolean(interaction?.guild && interaction?.member && hasModPermission(interaction.member));
}
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
  const span = days * 24 * 60 * 60 * 1000;
  return { start: nowMs - span, end: nowMs, previousStart: nowMs - (span * 2), previousEnd: nowMs - span };
}
function inBounds(timestamp, start, end) { return timestamp > 0 && (start === null || timestamp >= start) && timestamp <= end; }
function getAuditRows(guildId, bounds) {
  try {
    const rows = db.prepare('SELECT actor_id, event, created_at FROM case_audit WHERE guild_id = ? ORDER BY created_at DESC').all(String(guildId));
    return rows.filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end));
  } catch (error) {
    console.error('❌ Moderation analytics audit query failed:', error);
    return [];
  }
}
function flattenAppeals(cases) {
  const result = [];
  for (const modCase of cases) for (const appeal of getCaseAppeals(modCase) || []) result.push({ modCase, appeal });
  return result;
}
function getModerationAnalytics(guildId, windowKey = '30d') {
  const window = normalizeAnalyticsWindow(windowKey);
  const bounds = analyticsBounds(window);
  const allCases = getAllCases(guildId) || [];
  const cases = allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.start, bounds.end));
  const previousCases = bounds.previousStart === null ? [] : allCases.filter((modCase) => inBounds(getCaseTime(modCase), bounds.previousStart, bounds.previousEnd));
  const actionCounts = {};
  const statusCounts = {};
  const moderatorCounts = {};
  const userCounts = {};
  for (const modCase of cases) {
    increment(actionCounts, String(modCase.action || 'unknown'));
    increment(statusCounts, String(modCase.status || 'active'));
    increment(moderatorCounts, modCase.moderatorId);
    increment(userCounts, modCase.userId);
  }
  const appealRows = flattenAppeals(allCases).filter(({ appeal }) => inBounds(new Date(appeal.submittedAt || 0).getTime(), bounds.start, bounds.end));
  const appealCounts = { pending: 0, approved: 0, denied: 0 };
  for (const { appeal } of appealRows) increment(appealCounts, appeal.status || 'pending');
  const resolvedAppeals = appealCounts.approved + appealCounts.denied;
  const repeatOffenders = Object.values(userCounts).filter((count) => count > 1).length;
  const auditRows = getAuditRows(guildId, bounds);
  const moderatorAuditCounts = {};
  for (const row of auditRows) increment(moderatorAuditCounts, row.actor_id);
  const trendDays = Math.min(7, ANALYTICS_WINDOWS[window] || 7);
  const trend = [];
  for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    dayStart.setUTCDate(dayStart.getUTCDate() - offset);
    const start = dayStart.getTime();
    const end = start + (24 * 60 * 60 * 1000) - 1;
    trend.push({ label: dayStart.toISOString().slice(5, 10), count: cases.filter((modCase) => inBounds(getCaseTime(modCase), start, end)).length });
  }
  return {
    window,
    windowLabel: ANALYTICS_WINDOW_LABELS[window],
    totalCases: cases.length,
    previousCases: previousCases.length,
    change: previousCases.length ? Math.round(((cases.length - previousCases.length) / previousCases.length) * 100) : null,
    activeCases: statusCounts.active || 0,
    reversedCases: statusCounts.reversed || 0,
    expiredCases: statusCounts.expired || 0,
    actionCounts,
    uniqueUsers: Object.keys(userCounts).length,
    repeatOffenders,
    topModerators: topEntries(moderatorCounts),
    topUsers: topEntries(userCounts),
    appealCounts,
    resolvedAppeals,
    appealApprovalRate: percentage(appealCounts.approved, resolvedAppeals),
    reversalRate: percentage(statusCounts.reversed || 0, cases.length),
    auditActions: auditRows.length,
    moderatorAuditCounts,
    trend,
    cases,
  };
}
function getModeratorAnalytics(guildId, moderatorId, windowKey = '30d') {
  const analytics = getModerationAnalytics(guildId, windowKey);
  const cases = analytics.cases.filter((modCase) => String(modCase.moderatorId) === String(moderatorId));
  const actionCounts = {};
  const statusCounts = {};
  const affectedUsers = {};
  for (const modCase of cases) {
    increment(actionCounts, String(modCase.action || 'unknown'));
    increment(statusCounts, String(modCase.status || 'active'));
    increment(affectedUsers, modCase.userId);
  }
  const appeals = flattenAppeals(cases);
  const appealCounts = { pending: 0, approved: 0, denied: 0 };
  for (const { appeal } of appeals) {
    const submittedAt = new Date(appeal.submittedAt || 0).getTime();
    const bounds = analyticsBounds(analytics.window);
    if (inBounds(submittedAt, bounds.start, bounds.end)) increment(appealCounts, appeal.status || 'pending');
  }
  const bounds = analyticsBounds(analytics.window);
  let auditRows = [];
  try {
    auditRows = db.prepare('SELECT event, created_at FROM case_audit WHERE guild_id = ? AND actor_id = ? ORDER BY created_at DESC').all(String(guildId), String(moderatorId)).filter((row) => inBounds(getAuditTime(row), bounds.start, bounds.end));
  } catch (error) {
    console.error('❌ Moderator history audit query failed:', error);
  }
  const eventCounts = {};
  for (const row of auditRows) increment(eventCounts, row.event || 'unknown');
  const resolvedAppeals = appealCounts.approved + appealCounts.denied;
  return {
    ...analytics,
    moderatorId: String(moderatorId),
    moderatorCases: cases.length,
    moderatorActionCounts: actionCounts,
    moderatorStatusCounts: statusCounts,
    affectedUsers: Object.keys(affectedUsers).length,
    repeatTargets: Object.values(affectedUsers).filter((count) => count > 1).length,
    moderatorAppeals: appealCounts,
    moderatorAppealApprovalRate: percentage(appealCounts.approved, resolvedAppeals),
    moderatorReversalRate: percentage(statusCounts.reversed || 0, cases.length),
    moderatorAuditActions: auditRows.length,
    topAuditEvents: topEntries(eventCounts),
    recentCases: cases.slice().sort((a, b) => getCaseTime(b) - getCaseTime(a)).slice(0, 5),
  };
}

function buildDashboardNav(targetId, activeView = DEFAULT_VIEW) {
  const items = [['overview', 'Overview'], ['actions', 'Actions'], ['cases', 'Cases'], ['tools', 'Tools'], ['analytics', 'Analytics']];
  return [new ActionRowBuilder().addComponents(items.map(([view, label]) => new ButtonBuilder().setCustomId(`mod_dashboard:${targetId || 'none'}:${view}`).setLabel(label).setStyle(activeView === view ? ButtonStyle.Primary : ButtonStyle.Secondary)))];
}
function buildUserSelectRow() {
  return new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('mod_user_select').setPlaceholder('👤 Select any server member to moderate').setMinValues(1).setMaxValues(1));
}
function buildActionSelect(targetId) {
  return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`mod_action_select:${targetId || 'none'}`).setPlaceholder('Choose an action').setDisabled(!targetId).addOptions(
    { label: 'Warn', value: 'warn' }, { label: 'Timeout', value: 'timeout' }, { label: 'Kick', value: 'kick' }, { label: 'Ban', value: 'ban' }, { label: 'Remove Warning', value: 'remove-warning' }, { label: 'Remove Timeout', value: 'remove-timeout' }
  ))];
}
function buildActionsRows(targetId, member, guild) {
  const id = targetId || 'none';
  const permissions = { warn: canUseModAction(member, guild, 'warn'), timeout: canUseModAction(member, guild, 'timeout'), kick: canUseModAction(member, guild, 'kick'), ban: canUseModAction(member, guild, 'ban'), removeWarning: canUseModAction(member, guild, 'remove_warning'), removeTimeout: canUseModAction(member, guild, 'remove_timeout') };
  return [
    buildUserSelectRow(),
    ...buildActionSelect(targetId),
    new ActionRowBuilder().addComponents(
      createSecondaryButton(`mod_open_warn:${id}`, 'Warn', getEmoji('WARNING', '⚠️'), !targetId || !permissions.warn),
      createSecondaryButton(`mod_open_timeout:${id}`, 'Timeout', getEmoji('TIMEOUT', '⏳'), !targetId || !permissions.timeout),
      createDangerButton(`mod_open_kick:${id}`, 'Kick', getEmoji('KICK', '👢'), !targetId || !permissions.kick),
      createDangerButton(`mod_open_ban:${id}`, 'Ban', getEmoji('BAN', '🔨'), !targetId || !permissions.ban)
    ),
    new ActionRowBuilder().addComponents(
      createSecondaryButton(`mod_remove_warning:${id}`, 'Remove Warning', getEmoji('DELETE', '🗑️'), !targetId || !permissions.removeWarning),
      createSecondaryButton(`mod_remove_timeout:${id}`, 'Remove Timeout', getEmoji('SUCCESS', '✅'), !targetId || !permissions.removeTimeout),
      createSuccessButton(`mod_refresh:${id}:overview`, 'Refresh', getEmoji('REFRESH', '🔄'))
    ),
  ];
}
function buildToolsRows(targetId, member, guild) {
  const id = targetId || 'none';
  const permissions = { viewCaseDetail: canUseModAction(member, guild, 'view_case_detail'), editCase: canUseModAction(member, guild, 'edit_case'), bulkWarn: canUseModAction(member, guild, 'bulk_warn'), bulkTimeout: canUseModAction(member, guild, 'bulk_timeout'), bulkKick: canUseModAction(member, guild, 'bulk_kick'), bulkBan: canUseModAction(member, guild, 'bulk_ban'), searchCases: canUseModAction(member, guild, 'view_case_detail') };
  return [
    buildUserSelectRow(),
    new ActionRowBuilder().addComponents(createPrimaryButton('mod_select_user', 'Select User', getEmoji('USER', '👤')), createSecondaryButton(`mod_case_detail:${id}`, 'Case Detail', getEmoji('SEARCH', '🔎'), !targetId || !permissions.viewCaseDetail), createSecondaryButton(`mod_edit_case:${id}`, 'Edit Case', getEmoji('EDIT', '✏️'), !targetId || !permissions.editCase)),
    new ActionRowBuilder().addComponents(createSecondaryButton('mod_case_search', 'Search Cases', getEmoji('SEARCH', '🔎'), !permissions.searchCases), createSecondaryButton('mod_bulk_warn', 'Bulk Warn', getEmoji('WARNING', '⚠️'), !permissions.bulkWarn), createSecondaryButton('mod_bulk_timeout', 'Bulk Timeout', getEmoji('TIMEOUT', '⏳'), !permissions.bulkTimeout), createSecondaryButton('mod_bulk_kick', 'Bulk Kick', getEmoji('KICK', '👢'), !permissions.bulkKick)),
    new ActionRowBuilder().addComponents(createDangerButton('mod_bulk_ban', 'Bulk Ban', getEmoji('BAN', '🔨'), !permissions.bulkBan)),
  ];
}
function buildOverviewEmbed(guild, moderator, target, stats = {}, staffDisplay = null) {
  return createEmbed({ title: 'Moderation Command Centre', description: target ? `Target: ${target.user}` : 'No target selected.', color: COLORS.PRIMARY, fields: [
    { name: 'Staff', value: staffDisplay || String(moderator || 'Unknown'), inline: false }, { name: 'Warnings', value: String(stats.warningCount ?? 0), inline: true }, { name: 'Cases', value: String(stats.caseCount ?? 0), inline: true }, { name: 'Latest Case', value: stats.lastCaseSummary || 'No cases found.', inline: false },
  ] });
}
function buildActionsEmbed(interaction, target) {
  return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`🔐` Moderation Actions').setDescription(target ? [`\`👤\` **Target:** ${target.user}`, `\`🆔\` **User ID:** \`${target.id}\``, `\`🏷️\` **User Tag:** \`${target.user.tag}\``, '', '`⚡` Choose a moderation action below.'].join('\n') : ['`⚠️` **No user selected**', '', 'Use the user selector below to choose any member in this server.'].join('\n'));
}
function buildCasesEmbed(target, cases = [], page = 0, totalPages = 1, actionFilter = 'all', statusFilter = 'all') {
  const description = cases.length ? cases.map((entry) => `#${entry.caseId} - ${entry.action} - ${getStatusLabel(entry)}\nReason: ${entry.reason || 'No reason provided'}`).join('\n\n') : 'No cases found for this user.';
  return createEmbed({ title: target?.user?.tag ? `Cases - ${target.user.tag}` : 'Cases', description, color: COLORS.PRIMARY, footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}` });
}
function buildToolsEmbed(interaction) {
  return baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`🧰` Moderation Tools').setDescription(['`⚙️` Utility actions and bulk moderation controls.', '', '`👤` Select a user to inspect cases or edit moderation history.', '`🔎` Search the full moderation case history.', '`📦` Bulk tools are permission-gated for staff safety.'].join('\n'));
}
function buildAnalyticsOverviewEmbed(guild, analytics) {
  const trend = analytics.trend.map((entry) => `${entry.label}: **${entry.count}**`).join(' • ');
  const topModerators = analytics.topModerators.length ? analytics.topModerators.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderator activity.';
  const topUsers = analytics.topUsers.length ? analytics.topUsers.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join('\n') : 'No moderated users.';
  const appeal = analytics.appealCounts;
  const changeText = analytics.change === null ? 'No previous-period baseline' : `${analytics.change >= 0 ? '+' : ''}${analytics.change}% vs previous period`;
  return createEmbed({
    title: `📊 Moderation Analytics • ${analytics.windowLabel}`,
    description: `Stats for **${guild?.name || 'this server'}**\n${changeText}`,
    color: COLORS.PRIMARY,
    fields: [
      { name: 'Cases', value: `Total **${analytics.totalCases}** • Active **${analytics.activeCases}** • Reversed **${analytics.reversedCases}** • Expired **${analytics.expiredCases}**`, inline: false },
      { name: 'Actions', value: formatActionBreakdown(analytics.actionCounts), inline: false },
      { name: 'Members', value: `Unique **${analytics.uniqueUsers}** • Repeat offenders **${analytics.repeatOffenders}**`, inline: true },
      { name: 'Reversal Rate', value: analytics.reversalRate, inline: true },
      { name: 'Audit Activity', value: `${analytics.auditActions} events`, inline: true },
      { name: 'Appeals', value: `Pending **${appeal.pending}** • Approved **${appeal.approved}** • Denied **${appeal.denied}** • Approval rate **${analytics.appealApprovalRate}**`, inline: false },
      { name: 'Top Moderators', value: topModerators.slice(0, 1024), inline: true },
      { name: 'Repeat / Frequent Members', value: topUsers.slice(0, 1024), inline: true },
      { name: 'Recent Daily Case Trend', value: trend || 'No recent cases.', inline: false },
    ],
    footer: 'Select a moderator below for individual history and performance.',
  });
}
function buildModeratorAnalyticsEmbed(guild, analytics) {
  const appeals = analytics.moderatorAppeals;
  const recentCases = analytics.recentCases.length ? analytics.recentCases.map((entry) => `#${entry.caseId} • ${entry.action} • ${entry.status || 'active'} • <@${entry.userId}>`).join('\n') : 'No cases in this period.';
  const auditEvents = analytics.topAuditEvents.length ? analytics.topAuditEvents.map(([event, count]) => `${String(event).replace(/^case\./, '')}: **${count}**`).join('\n') : 'No audited activity.';
  return createEmbed({
    title: `👤 Moderator History • ${analytics.windowLabel}`,
    description: `Moderator <@${analytics.moderatorId}> • ${guild?.name || 'Server'}`,
    color: COLORS.PRIMARY,
    fields: [
      { name: 'Case Activity', value: `Cases **${analytics.moderatorCases}** • Affected users **${analytics.affectedUsers}** • Repeat targets **${analytics.repeatTargets}**`, inline: false },
      { name: 'Actions', value: formatActionBreakdown(analytics.moderatorActionCounts), inline: false },
      { name: 'Case Outcomes', value: `Active **${analytics.moderatorStatusCounts.active || 0}** • Reversed **${analytics.moderatorStatusCounts.reversed || 0}** • Expired **${analytics.moderatorStatusCounts.expired || 0}** • Reversal rate **${analytics.moderatorReversalRate}**`, inline: false },
      { name: 'Appeals on Their Cases', value: `Pending **${appeals.pending}** • Approved **${appeals.approved}** • Denied **${appeals.denied}** • Approval rate **${analytics.moderatorAppealApprovalRate}**`, inline: false },
      { name: 'Audited Staff Activity', value: `**${analytics.moderatorAuditActions}** events`, inline: true },
      { name: 'Top Audit Events', value: auditEvents.slice(0, 1024), inline: true },
      { name: 'Recent Cases', value: recentCases.slice(0, 1024), inline: false },
    ],
    footer: 'Metrics describe recorded moderation activity; they are not a staff quality score.',
  });
}
function buildAnalyticsRows(windowKey, mode = 'overview', moderatorId = null, currentUserId = null) {
  const window = normalizeAnalyticsWindow(windowKey);
  const windowRow = new ActionRowBuilder().addComponents(Object.keys(ANALYTICS_WINDOWS).map((key) => new ButtonBuilder().setCustomId(`mod_analytics_window:${key}:${mode}:${moderatorId || 'none'}`).setLabel(ANALYTICS_WINDOW_LABELS[key]).setStyle(window === key ? ButtonStyle.Primary : ButtonStyle.Secondary)));
  const selectRow = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`mod_analytics_moderator_select:${window}`).setPlaceholder('👤 Select moderator for history').setMinValues(1).setMaxValues(1));
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mod_analytics_overview:${window}`).setLabel('📊 Overview').setStyle(mode === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_analytics_my:${window}:${currentUserId || 'none'}`).setLabel('👤 My History').setStyle(mode === 'moderator' && moderatorId === currentUserId ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod_analytics_refresh:${window}:${mode}:${moderatorId || 'none'}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mod_case_appeal_queue:0').setLabel('⚖️ Appeal Queue').setStyle(ButtonStyle.Secondary)
  );
  return [windowRow, selectRow, actionRow];
}
function buildTargetStats(guildId, target) {
  if (!target) return { warningCount: undefined, caseCount: undefined, lastCaseSummary: null };
  const cases = getCasesForUser(guildId, target.id) || [];
  return { warningCount: getWarningCountForUser(guildId, target.id), caseCount: getCaseCountForUser(guildId, target.id), lastCaseSummary: cases[0] ? formatCaseSummary(cases[0]) : null };
}
function getCasesPageData(guildId, targetId, options = {}) {
  const actionFilter = options.actionFilter || 'all';
  const statusFilter = options.statusFilter || 'all';
  const filters = {};
  if (actionFilter !== 'all') filters.action = actionFilter;
  if (statusFilter !== 'all') filters.status = statusFilter;
  const allCases = getFilteredCases(guildId, targetId, filters) || [];
  const totalPages = Math.max(1, Math.ceil(allCases.length / CASES_PER_PAGE));
  const page = Math.max(0, Math.min(Number(options.page) || 0, totalPages - 1));
  return { actionFilter, statusFilter, page, totalPages, pageCases: allCases.slice(page * CASES_PER_PAGE, (page + 1) * CASES_PER_PAGE) };
}

async function buildDashboardPayload(discord, interaction, target, view = DEFAULT_VIEW, options = {}) {
  await syncExpiredWarningsToCases(interaction.guild.id);
  const context = normalizeDashboardContext({ ...options, view });
  const safeView = context.view;
  const targetId = target?.id || null;
  const stats = buildTargetStats(interaction.guild.id, target);
  const staff = getStaffDisplay(interaction.member, interaction.guild);
  const staffDisplay = `${staff.badge} ${staff.label} • ${interaction.member}`;
  const embeds = [];
  const components = [...buildDashboardNav(targetId, safeView)];
  if (safeView === 'overview') {
    embeds.push(buildOverviewEmbed(interaction.guild, interaction.member, target, stats, staffDisplay));
    components.push(...buildActionsRows(targetId, interaction.member, interaction.guild));
  } else if (safeView === 'actions') {
    embeds.push(buildActionsEmbed(interaction, target));
    components.push(...buildActionsRows(targetId, interaction.member, interaction.guild));
  } else if (safeView === 'cases') {
    if (!target) {
      embeds.push(baseEmbed(interaction.client, COLORS.PRIMARY).setTitle('`📁` Cases').setDescription(['`⚠️` **No user selected**', '', 'Use the user selector below to choose any member first.'].join('\n')));
      components.push(buildUserSelectRow());
    } else {
      const pageData = getCasesPageData(interaction.guild.id, target.id, context);
      embeds.push(buildCasesEmbed(target, pageData.pageCases, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter));
      components.push(buildUserSelectRow(), ...buildCasesPageButtons(target.id, pageData.page, pageData.totalPages, pageData.actionFilter, pageData.statusFilter), ...buildCaseFilterButtons(target.id, pageData.actionFilter, pageData.statusFilter, pageData.page));
    }
  } else if (safeView === 'tools') {
    embeds.push(buildToolsEmbed(interaction));
    components.push(...buildToolsRows(targetId, interaction.member, interaction.guild));
  } else if (safeView === 'analytics') {
    const window = context.analyticsWindow;
    if (context.analyticsMode === 'moderator' && context.analyticsModeratorId) embeds.push(buildModeratorAnalyticsEmbed(interaction.guild, getModeratorAnalytics(interaction.guild.id, context.analyticsModeratorId, window)));
    else embeds.push(buildAnalyticsOverviewEmbed(interaction.guild, getModerationAnalytics(interaction.guild.id, window)));
    components.push(...buildAnalyticsRows(window, context.analyticsMode, context.analyticsModeratorId, interaction.user?.id || null));
  }
  return { embeds, components: components.slice(0, 5) };
}

async function renderDashboard(interaction, targetId, view = DEFAULT_VIEW, context = {}) {
  const target = targetId && targetId !== 'none' ? await fetchTarget(interaction.guild, targetId) : null;
  if (targetId && targetId !== 'none' && !target) return safeReply(interaction, ephemeralError('Could not find the selected user.'));
  await interaction.update(await buildDashboardPayload(Discord, interaction, target, view, context));
  return true;
}
async function refreshDashboard(discord, interaction, target, context = {}) {
  const safeContext = normalizeDashboardContext(context);
  const payload = await buildDashboardPayload(discord, interaction, target, safeContext.view, safeContext);
  try {
    if (interaction.message) { await interaction.message.edit(payload); return true; }
    if (interaction.replied || interaction.deferred) { await interaction.editReply(payload); return true; }
    await interaction.reply({ ...payload, flags: 64 });
    return true;
  } catch (error) {
    console.error('❌ Failed to refresh moderation dashboard message:', error);
    return false;
  }
}
async function refreshCasesDashboard(interaction, target) { if (!target) return false; return refreshDashboard(Discord, interaction, target, DEFAULT_CASES_CONTEXT); }
async function handleDashboardNavigation(interaction) {
  const id = String(interaction.customId || '');
  if (id === 'mod:overview') return renderDashboard(interaction, 'none', 'overview');
  if (id.startsWith('mod_analytics_window:')) {
    const [, window, mode = 'overview', moderatorId = 'none'] = id.split(':');
    return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId });
  }
  if (id.startsWith('mod_analytics_overview:')) {
    const [, window] = id.split(':');
    return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'overview' });
  }
  if (id.startsWith('mod_analytics_my:')) {
    const [, window, moderatorId] = id.split(':');
    return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId });
  }
  if (id.startsWith('mod_analytics_refresh:')) {
    const [, window, mode, moderatorId = 'none'] = id.split(':');
    return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: mode, analyticsModeratorId: moderatorId === 'none' ? null : moderatorId });
  }
  if (id.startsWith('mod_dashboard:') || id.startsWith('mod_refresh:')) {
    const [, targetId = 'none', view = DEFAULT_VIEW] = id.split(':');
    const extra = view === 'analytics' ? DEFAULT_ANALYTICS_CONTEXT : {};
    return renderDashboard(interaction, targetId, view, extra);
  }
  if (id.startsWith('mod_filter_cases:') || id.startsWith('mod_case_page:')) {
    const [, targetId = 'none', actionFilter = 'all', statusFilter = 'all', page = '0'] = id.split(':');
    return renderDashboard(interaction, targetId, 'cases', { actionFilter, statusFilter, page });
  }
  return false;
}
async function handleUserSelectMenu(interaction) {
  if (String(interaction.customId || '').startsWith('mod_analytics_moderator_select:')) {
    const [, window] = String(interaction.customId).split(':');
    const moderatorId = interaction.values?.[0];
    if (!moderatorId) return safeReply(interaction, ephemeralError('No moderator selected.'));
    return renderDashboard(interaction, 'none', 'analytics', { analyticsWindow: window, analyticsMode: 'moderator', analyticsModeratorId: moderatorId });
  }
  if (interaction.customId !== 'mod_user_select') return false;
  const target = await fetchTarget(interaction.guild, interaction.values[0]);
  if (!target) return safeReply(interaction, ephemeralError('Could not find that user.'));
  return renderDashboard(interaction, target.id, 'overview');
}
async function handleSelectUserButton(interaction) {
  if (interaction.customId !== 'mod_select_user') return false;
  return safeReply(interaction, { content: '👤 Select a user:', components: [buildUserSelectRow()], flags: 64 });
}
async function openModPanel(interaction, options = {}) {
  if (!canOpenModPanel(interaction)) return interaction.deferred || interaction.replied ? interaction.editReply(noAccessPayload()) : interaction.reply(noAccessPayload());
  const view = options.view || DEFAULT_VIEW;
  const target = options.target || null;
  const payload = await buildDashboardPayload(Discord, interaction, target, view, options);
  const finalPayload = { ...payload, flags: 64 };
  return interaction.deferred || interaction.replied ? interaction.editReply(finalPayload) : interaction.reply(finalPayload);
}

module.exports = {
  openModPanel,
  refreshDashboard,
  refreshCasesDashboard,
  handleDashboardNavigation,
  handleUserSelectMenu,
  handleSelectUserButton,
  getModerationAnalytics,
  getModeratorAnalytics,
};
