const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

const { COLORS, EMOJIS } = require('./uiConfig');
const { createEmbed } = require('./embeds');
const { getStatusLabel } = require('../../functions/moderation/caseHelpers');

/* ---------------- DASHBOARD NAV ---------------- */

function buildDashboardNav(targetId, activeView = 'overview') {
  const items = [
    { view: 'overview', label: `${EMOJIS.DASHBOARD} Overview` },
    { view: 'actions', label: `${EMOJIS.ACTIONS} Actions` },
    { view: 'cases', label: `${EMOJIS.CASES} Cases` },
    { view: 'tools', label: `${EMOJIS.TOOLS} Tools` },
    { view: 'analytics', label: `${EMOJIS.ANALYTICS} Analytics` },
  ];

  return [
    new ActionRowBuilder().addComponents(
      items.map((item) =>
        new ButtonBuilder()
          .setCustomId(`mod_dashboard:${targetId || 'none'}:${item.view}`)
          .setLabel(item.label)
          .setStyle(activeView === item.view ? ButtonStyle.Primary : ButtonStyle.Secondary)
      )
    ),
  ];
}

/* ---------------- HELPERS ---------------- */

function empty(value = '—') {
  return value;
}

function formatTargetLine(target) {
  if (!target) {
    return `${EMOJIS.WARNING} **No target selected**\nUse **${EMOJIS.USER} Select User** to begin.`;
  }

  return [
    `${EMOJIS.USER} **Target Selected**`,
    `> ${target.user}`,
    `> \`${target.user.tag}\``,
    `> ID: \`${target.id}\``,
  ].join('\n');
}

/* ---------------- OVERVIEW EMBED ---------------- */

function buildOverviewEmbed(guild, moderator, target, stats = {}, staffDisplay = null) {
  const staffLine = staffDisplay || `${EMOJIS.MODERATOR} Moderator • ${moderator}`;

  return createEmbed({
    title: `${EMOJIS.DASHBOARD} Moderation Command Centre`,
    description: [
      `**${guild.name}** moderation hub`,
      '',
      formatTargetLine(target),
    ].join('\n'),
    color: COLORS.PRIMARY,
    fields: [
      {
        name: '🔐 Active Staff',
        value: staffLine,
        inline: false,
      },
      {
        name: `${EMOJIS.WARNING} Warnings`,
        value: target ? `\`${stats.warningCount ?? 0}\`` : empty(),
        inline: true,
      },
      {
        name: `${EMOJIS.CASES} Cases`,
        value: target ? `\`${stats.caseCount ?? 0}\`` : empty(),
        inline: true,
      },
      {
        name: '📌 Target Status',
        value: target ? '`Ready for action`' : '`Awaiting target`',
        inline: true,
      },
      {
        name: `${EMOJIS.CASE} Latest Case`,
        value: stats.lastCaseSummary || `${EMOJIS.ERROR} No cases found.`,
        inline: false,
      },
    ],
  });
}

/* ---------------- CASES EMBED ---------------- */

function buildCasesEmbed(
  target,
  cases,
  page,
  totalPages,
  actionFilter = 'all',
  statusFilter = 'all'
) {
  const description = cases.length
    ? cases
        .map((entry) =>
          [
            `**#${entry.caseId}** • \`${entry.action}\` • ${getStatusLabel(entry)}`,
            `> **Reason:** ${entry.reason || 'No reason provided'}`,
          ].join('\n')
        )
        .join('\n\n')
    : `${EMOJIS.ERROR} No cases found for this user.`;

  return createEmbed({
    title: `${EMOJIS.CASES} Cases • ${target.user.tag}`,
    description,
    color: COLORS.PRIMARY,
    footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}`,
  });
}

/* ---------------- ANALYTICS EMBED ---------------- */

function buildAnalyticsEmbed(guild, analytics = {}) {
  return createEmbed({
    title: `${EMOJIS.ANALYTICS} Moderation Analytics`,
    description: `${EMOJIS.FIRE} Security and moderation stats for **${guild.name}**`,
    color: COLORS.PRIMARY,
    fields: [
      {
        name: `${EMOJIS.CASE} Total Cases`,
        value: `\`${analytics.totalCases ?? 0}\``,
        inline: true,
      },
      {
        name: `${EMOJIS.ACTIVE} Active`,
        value: `\`${analytics.activeCases ?? 0}\``,
        inline: true,
      },
      {
        name: `${EMOJIS.EXPIRED} Expired`,
        value: `\`${analytics.expiredCases ?? 0}\``,
        inline: true,
      },
      {
        name: `${EMOJIS.WARNING} Warns`,
        value: `\`${analytics.warnCount ?? 0}\``,
        inline: true,
      },
      {
        name: `${EMOJIS.TIMEOUT} Timeouts`,
        value: `\`${analytics.timeoutCount ?? 0}\``,
        inline: true,
      },
      {
        name: `${EMOJIS.BAN} Bans`,
        value: `\`${analytics.banCount ?? 0}\``,
        inline: true,
      },
      {
        name: '🏆 Top Moderators',
        value: analytics.topModerators?.length
          ? analytics.topModerators.join('\n')
          : 'No moderator data yet.',
        inline: false,
      },
      {
        name: '🎯 Most Moderated Users',
        value: analytics.topUsers?.length
          ? analytics.topUsers.join('\n')
          : 'No user data yet.',
        inline: false,
      },
    ],
  });
}

/* ---------------- ACTION SELECT ---------------- */

function buildActionSelect(targetId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mod_action_select:${targetId || 'none'}`)
        .setPlaceholder(`${EMOJIS.ACTIONS} Choose a moderation action`)
        .setDisabled(!targetId)
        .addOptions(
          { label: 'Warn', value: 'warn', emoji: EMOJIS.WARNING },
          { label: 'Timeout', value: 'timeout', emoji: EMOJIS.TIMEOUT },
          { label: 'Kick', value: 'kick', emoji: EMOJIS.KICK },
          { label: 'Ban', value: 'ban', emoji: EMOJIS.BAN },
          { label: 'Remove Warning', value: 'remove-warning', emoji: EMOJIS.DELETE },
          { label: 'Remove Timeout', value: 'remove-timeout', emoji: EMOJIS.SUCCESS }
        )
    ),
  ];
}

/* ---------------- PAGINATION ---------------- */

function buildPagination(targetId, page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`page_prev:${targetId}:${page - 1}`)
        .setLabel(`${EMOJIS.BACK} Prev`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),

      new ButtonBuilder()
        .setCustomId(`page_next:${targetId}:${page + 1}`)
        .setLabel(`Next ${EMOJIS.NEXT}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
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