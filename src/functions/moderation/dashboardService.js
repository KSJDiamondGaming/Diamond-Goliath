// functions/moderation/dashboardService.js

const {
  ActionRowBuilder,
  ButtonStyle,
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

const {
  COLORS,
  EMOJIS,
  baseEmbed,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
} = require('../../helpers/ui/embeds');

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

function getEmoji(key, fallback) {
  return EMOJIS?.[key] || fallback;
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
      createSecondaryButton(
        `mod_open_warn:${id}`,
        'Warn',
        getEmoji('WARNING', '⚠️'),
        !targetId || !permissions.warn
      ),

      createSecondaryButton(
        `mod_open_timeout:${id}`,
        'Timeout',
        getEmoji('TIMEOUT', '⏳'),
        !targetId || !permissions.timeout
      ),

      createDangerButton(
        `mod_open_kick:${id}`,
        'Kick',
        getEmoji('KICK', '👢'),
        !targetId || !permissions.kick
      ),

      createDangerButton(
        `mod_open_ban:${id}`,
        'Ban',
        getEmoji('BAN', '🔨'),
        !targetId || !permissions.ban
      )
    ),

    new ActionRowBuilder().addComponents(
      createSecondaryButton(
        `mod_remove_warning:${id}`,
        'Remove Warning',
        getEmoji('DELETE', '🗑️'),
        !targetId || !permissions.removeWarning
      ),

      createSecondaryButton(
        `mod_remove_timeout:${id}`,
        'Remove Timeout',
        getEmoji('SUCCESS', '✅'),
        !targetId || !permissions.removeTimeout
      ),

      createSuccessButton(
        `mod_refresh:${id}:overview`,
        'Refresh',
        getEmoji('REFRESH', '🔄')
      )
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
      createPrimaryButton(
        'mod_select_user',
        'Select User',
        getEmoji('USER', '👤')
      ),

      createSecondaryButton(
        `mod_case_detail:${id}`,
        'Case Detail',
        getEmoji('SEARCH', '🔎'),
        !targetId || !permissions.viewCaseDetail
      ),

      createSecondaryButton(
        `mod_edit_case:${id}`,
        'Edit Case',
        getEmoji('EDIT', '✏️'),
        !targetId || !permissions.editCase
      )
    ),

    new ActionRowBuilder().addComponents(
      createSecondaryButton(
        'mod_bulk_warn',
        'Bulk Warn',
        getEmoji('WARNING', '⚠️'),
        !permissions.bulkWarn
      ),

      createSecondaryButton(
        'mod_bulk_timeout',
        'Bulk Timeout',
        getEmoji('TIMEOUT', '⏳'),
        !permissions.bulkTimeout
      ),

      createSecondaryButton(
        'mod_bulk_kick',
        'Bulk Kick',
        getEmoji('KICK', '👢'),
        !permissions.bulkKick
      ),

      createDangerButton(
        'mod_bulk_ban',
        'Bulk Ban',
        getEmoji('BAN', '🔨'),
        !permissions.bulkBan
      )
    ),
  ];
}

function buildSelectUserEmbed(interaction, title, description) {
  return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle(title)
    .setDescription(description);
}

function buildActionsEmbed(interaction, target) {
  return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('`🛡️` Moderation Actions')
    .setDescription(
      target
        ? [
            `\`👤\` **Target:** ${target.user}`,
            `\`🏷️\` **User Tag:** \`${target.user.tag}\``,
            '',
            '`⚡` Choose a moderation action below.',
          ].join('\n')
        : [
            '`⚠️` **No user selected**',
            '',
            'Select a user before running moderation actions.',
          ].join('\n')
    );
}

function buildToolsEmbed(interaction) {
  return baseEmbed(interaction.client, COLORS.PRIMARY)
    .setTitle('`🧰` Moderation Tools')
    .setDescription([
      '`⚙️` Utility actions and bulk moderation controls.',
      '',
      '`👤` Select a user to inspect cases or edit moderation history.',
      '`📦` Bulk tools are permission-gated for staff safety.',
    ].join('\n'));
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
    embeds.push(buildActionsEmbed(interaction, target));

    components.push(
      ...buildActionsRows(targetId, interaction.member, interaction.guild)
    );
  }

  if (safeView === 'cases') {
    if (!target) {
      embeds.push(
        buildSelectUserEmbed(
          interaction,
          '`📁` Cases',
          [
            '`⚠️` **No user selected**',
            '',
            'Select a user first to view their moderation cases.',
          ].join('\n')
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
    embeds.push(buildToolsEmbed(interaction));

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

    await interaction.reply({
      ...payload,
      flags: 64,
    });

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