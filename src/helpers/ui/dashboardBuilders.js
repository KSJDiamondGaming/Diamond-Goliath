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
          .setStyle(
            activeView === item.view
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary
          )
      )
    ),
  ];
}

/* ---------------- OVERVIEW EMBED ---------------- */

function buildOverviewEmbed(guild, moderator, target, stats = {}) {
  return createEmbed({
    title: `${EMOJIS.DASHBOARD} Moderation Dashboard`,
    description: target
      ? `${EMOJIS.USER} Managing **${target.user.tag}**`
      : `${EMOJIS.WARNING} No user selected yet.\nUse **${EMOJIS.USER} Select User** to begin.`,
    color: COLORS.PRIMARY,
    fields: [
      {
        name: `${EMOJIS.MODERATOR} Moderator`,
        value: `${moderator}`,
        inline: true,
      },
      {
        name: `${EMOJIS.WARNING} Warnings`,
        value: target ? String(stats.warningCount ?? 0) : '—',
        inline: true,
      },
      {
        name: `${EMOJIS.CASES} Cases`,
        value: target ? String(stats.caseCount ?? 0) : '—',
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
  return createEmbed({
    title: `${EMOJIS.CASES} Cases for ${target.user.tag}`,
    description: cases.length
      ? cases
          .map(
            (entry) =>
              `**#${entry.caseId}** • ${entry.action}\nStatus: ${getStatusLabel(
                entry
              )}\nReason: ${entry.reason || 'No reason'}`
          )
          .join('\n\n')
      : `${EMOJIS.ERROR} No cases found.`,
    color: COLORS.PRIMARY,
    footer: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${
      page + 1
    } of ${totalPages}`,
  });
}

/* ---------------- ANALYTICS EMBED ---------------- */

function buildAnalyticsEmbed(guild, analytics = {}) {
  return createEmbed({
    title: `${EMOJIS.ANALYTICS} Moderation Analytics`,
    description: `${EMOJIS.FIRE} Stats for **${guild.name}**`,
    color: COLORS.PRIMARY,
    fields: [
      {
        name: `${EMOJIS.CASE} Total Cases`,
        value: String(analytics.totalCases ?? 0),
        inline: true,
      },
      {
        name: `${EMOJIS.ACTIVE} Active`,
        value: String(analytics.activeCases ?? 0),
        inline: true,
      },
      {
        name: `${EMOJIS.EXPIRED} Expired`,
        value: String(analytics.expiredCases ?? 0),
        inline: true,
      },
      {
        name: `${EMOJIS.WARNING} Warns`,
        value: String(analytics.warnCount ?? 0),
        inline: true,
      },
      {
        name: `${EMOJIS.TIMEOUT} Timeouts`,
        value: String(analytics.timeoutCount ?? 0),
        inline: true,
      },
      {
        name: `${EMOJIS.BAN} Bans`,
        value: String(analytics.banCount ?? 0),
        inline: true,
      },
      {
        name: '🏆 Top Moderators',
        value: analytics.topModerators?.length
          ? analytics.topModerators.join('\n')
          : 'None',
        inline: false,
      },
      {
        name: '🎯 Top Moderated Users',
        value: analytics.topUsers?.length ? analytics.topUsers.join('\n') : 'None',
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
          {
            label: 'Remove Warning',
            value: 'remove-warning',
            emoji: EMOJIS.DELETE,
          },
          {
            label: 'Remove Timeout',
            value: 'remove-timeout',
            emoji: EMOJIS.SUCCESS,
          }
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

/* ---------------- EXPORTS ---------------- */

module.exports = {
  buildDashboardNav,
  buildOverviewEmbed,
  buildCasesEmbed,
  buildAnalyticsEmbed,
  buildActionSelect,
  buildPagination,
};