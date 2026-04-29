// functions/moderation/dashboardService.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const { getWarningCountForUser } = require('../../logging/warnings/warningStore');

const {
  getCaseCountForUser,
  getCasesForUser,
  getFilteredCases,
} = require('../../logging/cases/caseStore');

const {
  formatCaseSummary,
  syncExpiredWarningsToCases,
  getModerationAnalytics,
} = require('./caseHelpers');

const {
  buildDashboardNav,
  buildOverviewEmbed,
  buildCasesEmbed,
  buildAnalyticsEmbed,
  buildActionSelect,
} = require('../../helpers/ui/dashboardBuilders');

const {
  buildCaseFilterButtons,
  buildCasesPageButtons,
} = require('../../helpers/ui/caseComponentBuilders');

const { normalizeDashboardContext } = require('../../helpers/ui/pendingActionHelpers');
const { canUseModAction } = require('./moderationChecks');
const { COLORS, EMOJIS } = require('../../helpers/ui/uiConfig');

const allowedViews = new Set([
  'overview',
  'actions',
  'cases',
  'tools',
  'analytics',
]);

const DEFAULT_VIEW = 'overview';
const CASES_PER_PAGE = 5;

function getSafeView(view) {
  return allowedViews.has(view) ? view : DEFAULT_VIEW;
}

function getTargetId(target) {
  return target?.id || null;
}

function buildTargetStats(guildId, target) {
  if (!target) {
    return {
      warningCount: undefined,
      caseCount: undefined,
      lastCaseSummary: null,
    };
  }

  const cases = getCasesForUser(guildId, target.id) || [];
  const latestCase = cases[0] || null;

  return {
    warningCount: getWarningCountForUser(guildId, target.id),
    caseCount: getCaseCountForUser(guildId, target.id),
    lastCaseSummary: latestCase ? formatCaseSummary(latestCase) : null,
  };
}

function buildActionsRows(targetId, member, guild) {
  const id = targetId || 'none';

  const permissions = {
    warn: canUseModAction(member, guild, 'warn'),
    timeout: canUseModAction(member, guild, 'timeout'),
    kick: canUseModAction(member, guild, 'kick'),
    ban: canUseModAction(member, guild, 'ban'),
    removeWarning: canUseModAction(member, guild, 'remove_warning'),
    removeTimeout: canUseModAction(member, guild, 'remove_timeout'),
  };

  return [
    ...buildActionSelect(targetId),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_open_warn:${id}`)
        .setLabel(`${EMOJIS.WARNING} Warn`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.warn),

      new ButtonBuilder()
        .setCustomId(`mod_open_timeout:${id}`)
        .setLabel(`${EMOJIS.TIMEOUT} Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.timeout),

      new ButtonBuilder()
        .setCustomId(`mod_open_kick:${id}`)
        .setLabel(`${EMOJIS.KICK} Kick`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !permissions.kick),

      new ButtonBuilder()
        .setCustomId(`mod_open_ban:${id}`)
        .setLabel(`${EMOJIS.BAN} Ban`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !permissions.ban)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_remove_warning:${id}`)
        .setLabel(`${EMOJIS.DELETE} Remove Warning`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.removeWarning),

      new ButtonBuilder()
        .setCustomId(`mod_remove_timeout:${id}`)
        .setLabel(`${EMOJIS.SUCCESS} Remove Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.removeTimeout),

      new ButtonBuilder()
        .setCustomId(`mod_refresh:${id}:overview`)
        .setLabel(`${EMOJIS.REFRESH} Refresh`)
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

function buildToolsRows(targetId, member, guild) {
  const id = targetId || 'none';

  const permissions = {
    viewCaseDetail: canUseModAction(member, guild, 'view_case_detail'),
    editCase: canUseModAction(member, guild, 'edit_case'),
    bulkWarn: canUseModAction(member, guild, 'bulk_warn'),
    bulkTimeout: canUseModAction(member, guild, 'bulk_timeout'),
    bulkKick: canUseModAction(member, guild, 'bulk_kick'),
    bulkBan: canUseModAction(member, guild, 'bulk_ban'),
  };

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_select_user')
        .setLabel(`${EMOJIS.USER} Select User`)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`mod_case_detail:${id}`)
        .setLabel(`${EMOJIS.SEARCH} Case Detail`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.viewCaseDetail),

      new ButtonBuilder()
        .setCustomId(`mod_edit_case:${id}`)
        .setLabel(`${EMOJIS.EDIT} Edit Case`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !permissions.editCase)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_bulk_warn')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.WARNING} Bulk Warn`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!permissions.bulkWarn),

      new ButtonBuilder()
        .setCustomId('mod_bulk_timeout')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.TIMEOUT} Bulk Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!permissions.bulkTimeout),

      new ButtonBuilder()
        .setCustomId('mod_bulk_kick')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.KICK} Bulk Kick`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!permissions.bulkKick),

      new ButtonBuilder()
        .setCustomId('mod_bulk_ban')
        .setLabel(`${EMOJIS.BULK} ${EMOJIS.BAN} Bulk Ban`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!permissions.bulkBan)
    ),
  ];
}

function buildSelectUserEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function buildActionsEmbed(target) {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJIS.ACTIONS} Moderation Actions`)
    .setDescription(
      target
        ? `${EMOJIS.USER} Choose an action for **${target.user.tag}**`
        : `${EMOJIS.WARNING} Select a user first.`
    )
    .setTimestamp();
}

function buildToolsEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJIS.TOOLS} Moderation Tools`)
    .setDescription(`${EMOJIS.SETTINGS} Utility actions and bulk moderation.`)
    .setTimestamp();
}

function getCasesPageData(guildId, targetId, options = {}) {
  const actionFilter = options.actionFilter || 'all';
  const statusFilter = options.statusFilter || 'all';
  const pageRaw = options.page || 0;

  const filters = {};

  if (actionFilter !== 'all') filters.action = actionFilter;
  if (statusFilter !== 'all') filters.status = statusFilter;

  const allCases = getFilteredCases(guildId, targetId, filters) || [];
  const totalPages = Math.max(1, Math.ceil(allCases.length / CASES_PER_PAGE));
  const page = Math.max(0, Math.min(Number(pageRaw) || 0, totalPages - 1));

  return {
    actionFilter,
    statusFilter,
    page,
    totalPages,
    pageCases: allCases.slice(
      page * CASES_PER_PAGE,
      page * CASES_PER_PAGE + CASES_PER_PAGE
    ),
  };
}

async function buildDashboardPayload(discord, interaction, target, view = DEFAULT_VIEW, options = {}) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  const safeView = getSafeView(view);
  const targetId = getTargetId(target);
  const stats = buildTargetStats(interaction.guild.id, target);

  const embeds = [];
  const components = [
    ...buildDashboardNav(targetId, safeView),
  ];

  if (safeView === 'overview') {
    embeds.push(
      buildOverviewEmbed(
        interaction.guild,
        interaction.member,
        target,
        stats
      )
    );

    components.push(
      ...buildActionsRows(targetId, interaction.member, interaction.guild)
    );
  }

  if (safeView === 'actions') {
    embeds.push(buildActionsEmbed(target));

    components.push(
      ...buildActionsRows(targetId, interaction.member, interaction.guild)
    );
  }

  if (safeView === 'cases') {
    if (!target) {
      embeds.push(
        buildSelectUserEmbed(
          `${EMOJIS.CASES} Cases`,
          `${EMOJIS.WARNING} Select a user first.`
        )
      );
    } else {
      const pageData = getCasesPageData(
        interaction.guild.id,
        target.id,
        options
      );

      embeds.push(
        buildCasesEmbed(
          target,
          pageData.pageCases,
          pageData.page,
          pageData.totalPages,
          pageData.actionFilter,
          pageData.statusFilter
        )
      );

      components.push(
        ...buildCasesPageButtons(
          target.id,
          pageData.page,
          pageData.totalPages,
          pageData.actionFilter,
          pageData.statusFilter
        ),
        ...buildCaseFilterButtons(
          target.id,
          pageData.actionFilter,
          pageData.statusFilter,
          pageData.page
        )
      );
    }
  }

  if (safeView === 'tools') {
    embeds.push(buildToolsEmbed());

    components.push(
      ...buildToolsRows(targetId, interaction.member, interaction.guild)
    );
  }

  if (safeView === 'analytics') {
    const analytics = getModerationAnalytics(interaction.guild.id);
    embeds.push(buildAnalyticsEmbed(interaction.guild, analytics));
  }

  return {
    embeds,
    components,
  };
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
      page: safeContext.page,
    }
  );

  try {
    if (interaction.message) {
      await interaction.message.edit(payload);
      return true;
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
      return true;
    }

    await interaction.reply(payload);
    return true;
  } catch (error) {
    console.error('❌ Failed to refresh moderation dashboard message:', error);
    return false;
  }
}

module.exports = {
  allowedViews,

  DEFAULT_VIEW,
  CASES_PER_PAGE,

  getSafeView,
  buildTargetStats,
  getCasesPageData,

  buildActionsRows,
  buildToolsRows,

  buildDashboardPayload,
  refreshDashboard,
};