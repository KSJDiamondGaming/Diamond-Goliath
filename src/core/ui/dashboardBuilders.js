const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { COLORS, EMOJIS } = require('./uiConfig');
const { createEmbed } = require('./embeds');
const { getStatusLabel } = require('../panels/moderation/caseHelpers');

function buildDashboardNav(targetId, activeView = 'overview') {
  const items = [
    { view: 'overview', label: 'Overview' },
    { view: 'actions', label: 'Actions' },
    { view: 'cases', label: 'Cases' },
    { view: 'tools', label: 'Tools' },
    { view: 'analytics', label: 'Analytics' },
  ];

  return [
    new ActionRowBuilder().addComponents(
      items.map((item) => new ButtonBuilder()
        .setCustomId(`mod_dashboard:${targetId || 'none'}:${item.view}`)
        .setLabel(item.label)
        .setStyle(activeView === item.view ? ButtonStyle.Primary : ButtonStyle.Secondary))
    ),
  ];
}

function buildOverviewEmbed(guild, moderator, target, stats = {}, staffDisplay = null) {
  return createEmbed({
    title: 'Moderation Command Centre',
    description: target ? `Target: ${target.user}` : 'No target selected.',
    color: COLORS.PRIMARY,
    fields: [
      { name: 'Staff', value: staffDisplay || String(moderator || 'Unknown'), inline: false },
      { name: 'Warnings', value: String(stats.warningCount ?? 0), inline: true },
      { name: 'Cases', value: String(stats.caseCount ?? 0), inline: true },
      { name: 'Latest Case', value: stats.lastCaseSummary || 'No cases found.', inline: false },
    ],
  });
}

function buildCasesEmbed(target, cases = [], page = 0, totalPages = 1, actionFilter = 'all', statusFilter = 'all') {
  const description = cases.length
    ? cases.map((entry) => `#${entry.caseId} - ${entry.action} - ${getStatusLabel(entry)}\nReason: ${entry.reason || 'No reason provided'}`).join('\n\n')
    : 'No cases found for this user.';

  return createEmbed({
    title: target?.user?.tag ? `Cases - ${target.user.tag}` : 'Cases',
    description,
    color: COLORS.PRIMARY,
    footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}`,
  });
}

function buildAnalyticsEmbed(guild, analytics = {}) {
  return createEmbed({
    title: 'Moderation Analytics',
    description: `Stats for ${guild?.name || 'this server'}`,
    color: COLORS.PRIMARY,
    fields: [
      { name: 'Total Cases', value: String(analytics.totalCases ?? 0), inline: true },
      { name: 'Active', value: String(analytics.activeCases ?? 0), inline: true },
      { name: 'Expired', value: String(analytics.expiredCases ?? 0), inline: true },
      { name: 'Warnings', value: String(analytics.warnCount ?? 0), inline: true },
    ],
  });
}

function buildActionSelect(targetId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mod_action_select:${targetId || 'none'}`)
        .setPlaceholder('Choose an action')
        .setDisabled(!targetId)
        .addOptions(
          { label: 'Warn', value: 'warn' },
          { label: 'Timeout', value: 'timeout' },
          { label: 'Kick', value: 'kick' },
          { label: 'Ban', value: 'ban' },
          { label: 'Remove Warning', value: 'remove-warning' },
          { label: 'Remove Timeout', value: 'remove-timeout' }
        )
    ),
  ];
}

function buildPagination(targetId, page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`page_prev:${targetId}:${page - 1}`).setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
      new ButtonBuilder().setCustomId(`page_next:${targetId}:${page + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    ),
  ];
}

module.exports = {
  buildDashboardNav,
  buildOverviewEmbed,
  buildCasesEmbed,
  buildAnalyticsEmbed,
  buildActionSelect,
  buildPagination,
};
