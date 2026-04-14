const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const { getWarningCountForUser } = require('../logging/modlogs/warningStore');
const {
  getCaseCountForUser,
  getCasesForUser,
  getFilteredCases
} = require('../logging/cases/caseStore');

const {
  formatCaseSummary,
  syncExpiredWarningsToCases,
  getModerationAnalytics
} = require('./caseHelpers');

const {
  buildDashboardNav,
  buildOverviewEmbed,
  buildCasesEmbed,
  buildAnalyticsEmbed,
  buildActionSelect
} = require('../utility/dashboardBuilders');

const {
  buildCaseFilterButtons,
  buildCasesPageButtons
} = require('../utility/caseComponentBuilders');

const { normalizeDashboardContext } = require('../utility/pendingActionHelpers');
const { canUseModAction } = require('../admin/permissionChecks');
const { COLORS, EMOJIS } = require('../utility/uiConfig');

const allowedViews = new Set([
  'overview',
  'actions',
  'cases',
  'tools',
  'analytics'
]);

function buildActionsRows(targetId, member, guild) {
  const canWarn = canUseModAction(member, guild, 'warn');
  const canTimeout = canUseModAction(member, guild, 'timeout');
  const canKick = canUseModAction(member, guild, 'kick');
  const canBan = canUseModAction(member, guild, 'ban');
  const canRemoveWarning = canUseModAction(member, guild, 'remove_warning');
  const canRemoveTimeout = canUseModAction(member, guild, 'remove_timeout');

  return [
    ...buildActionSelect(targetId),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_open_warn:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.WARNING} Warn`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canWarn),
      new ButtonBuilder()
        .setCustomId(`mod_open_timeout:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.TIMEOUT} Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canTimeout),
      new ButtonBuilder()
        .setCustomId(`mod_open_kick:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.KICK} Kick`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !canKick),
      new ButtonBuilder()
        .setCustomId(`mod_open_ban:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.BAN} Ban`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !canBan)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_remove_warning:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.DELETE} Remove Warning`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canRemoveWarning),
      new ButtonBuilder()
        .setCustomId(`mod_remove_timeout:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.SUCCESS} Remove Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canRemoveTimeout),
      new ButtonBuilder()
        .setCustomId(`mod_refresh:${targetId || 'none'}:overview`)
        .setLabel(`${EMOJIS.REFRESH} Refresh`)
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function buildToolsRows(targetId, member, guild) {
  const canViewCaseDetail = canUseModAction(member, guild, 'view_case_detail');
  const canEditCase = canUseModAction(member, guild, 'edit_case');
  const canBulkWarn = canUseModAction(member, guild, 'bulk_warn');
  const canBulkTimeout = canUseModAction(member, guild, 'bulk_timeout');
  const canBulkKick = canUseModAction(member, guild, 'bulk_kick');
  const canBulkBan = canUseModAction(member, guild, 'bulk_ban');

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_select_user')
        .setLabel(`${EMOJIS.USER} Select User`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_case_detail:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.SEARCH} Case Detail`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canViewCaseDetail),
      new ButtonBuilder()
        .setCustomId(`mod_edit_case:${targetId || 'none'}`)
        .setLabel(`${EMOJIS.EDIT} Edit Case`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canEditCase)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_bulk_warn')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.WARNING} Bulk Warn`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkWarn),
      new ButtonBuilder()
        .setCustomId('mod_bulk_timeout')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.TIMEOUT} Bulk Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkTimeout),
      new ButtonBuilder()
        .setCustomId('mod_bulk_kick')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.KICK} Bulk Kick`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkKick),
      new ButtonBuilder()
        .setCustomId('mod_bulk_ban')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.BAN} Bulk Ban`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canBulkBan)
    )
  ];
}

async function buildDashboardPayload(discord, interaction, target, view = 'overview', options = {}) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  const safeView = allowedViews.has(view) ? view : 'overview';

  const warningCount = target
    ? getWarningCountForUser(interaction.guild.id, target.id)
    : undefined;

  const caseCount = target
    ? getCaseCountForUser(interaction.guild.id, target.id)
    : undefined;

  const latestCase = target
    ? getCasesForUser(interaction.guild.id, target.id)[0]
    : null;

  const stats = {
    warningCount,
    caseCount,
    lastCaseSummary: latestCase ? formatCaseSummary(latestCase) : null
  };

  const embeds = [];
  const components = [...buildDashboardNav(target?.id || null, safeView)];

  if (safeView === 'overview') {
    embeds.push(buildOverviewEmbed(interaction.guild, interaction.member, target, stats));
    components.push(...buildActionsRows(target?.id || null, interaction.member, interaction.guild));
  }

  if (safeView === 'actions') {
    embeds.push(
      new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${EMOJIS.ACTIONS} Moderation Actions`)
        .setDescription(
          target
            ? `${EMOJIS.USER} Choose an action for **${target.user.tag}**`
            : `${EMOJIS.WARNING} Select a user first.`
        )
        .setTimestamp()
    );

    components.push(...buildActionsRows(target?.id || null, interaction.member, interaction.guild));
  }

  if (safeView === 'cases') {
    const actionFilter = options.actionFilter || 'all';
    const statusFilter = options.statusFilter || 'all';
    const pageRaw = options.page || 0;

    const filters = {};
    if (actionFilter !== 'all') filters.action = actionFilter;
    if (statusFilter !== 'all') filters.status = statusFilter;

    const allCases = target
      ? getFilteredCases(interaction.guild.id, target.id, filters)
      : [];

    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(allCases.length / perPage));
    const page = Math.max(0, Math.min(Number(pageRaw) || 0, totalPages - 1));
    const pageCases = allCases.slice(page * perPage, page * perPage + perPage);

    if (target) {
      embeds.push(buildCasesEmbed(target, pageCases, page, totalPages, actionFilter, statusFilter));
      components.push(
        ...buildCasesPageButtons(target.id, page, totalPages, actionFilter, statusFilter),
        ...buildCaseFilterButtons(target.id, actionFilter, statusFilter, page)
      );
    } else {
      embeds.push(
        new EmbedBuilder()
          .setColor(COLORS.PRIMARY)
          .setTitle(`${EMOJIS.CASES} Cases`)
          .setDescription(`${EMOJIS.WARNING} Select a user first.`)
          .setTimestamp()
      );
    }
  }

  if (safeView === 'tools') {
    embeds.push(
      new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${EMOJIS.TOOLS} Moderation Tools`)
        .setDescription(`${EMOJIS.SETTINGS} Utility actions and bulk moderation.`)
        .setTimestamp()
    );

    components.push(...buildToolsRows(target?.id || null, interaction.member, interaction.guild));
  }

  if (safeView === 'analytics') {
    const analytics = getModerationAnalytics(interaction.guild.id);
    embeds.push(buildAnalyticsEmbed(interaction.guild, analytics));
  }

  return { embeds, components };
}

async function refreshDashboard(discord, interaction, target, context = {}) {
  const safeContext = normalizeDashboardContext(context);

  const payload = await buildDashboardPayload(
    discord,
    interaction,
    target,
    safeContext.view,
    {
      actionFilter: safeContext.actionFilter,
      statusFilter: safeContext.statusFilter,
      page: safeContext.page
    }
  );

  try {
    if (interaction.message) {
      await interaction.message.edit(payload);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (error) {
    console.error('Failed to refresh moderation dashboard message:', error);
  }
}

module.exports = {
  allowedViews,
  buildDashboardPayload,
  refreshDashboard
};