// =========================
// 📦 Imports
// =========================
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');

const { handleEscalation, getRepeatReasonInfo } = require('./escalationSystem');

const {
  createCase,
  getCasesForUser,
  getFilteredCases,
  getCaseCountForUser,
  getCaseById,
  getAllCases,
  updateCaseReason,
  updateCaseStatus,
  updateCaseNote,
  clearCaseNote
} = require('../../utils/logging/cases/caseStore');

const {
  addWarning,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings
} = require('../logging/modlogs/warningStore');

const { sendModLog } = require('../../utils/logging/modlogs/modLog');

const {
  createPendingAction,
  getPendingAction,
  deletePendingAction
} = require('../../utils/logging/modlogs/pendingActionStore');

// =========================
// 🛡 Permission Helpers
// =========================
function hasModPermission(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  );
}

function getStaffLevel(member, guild) {
  if (!member) return 'none';
  if (member.id === guild.ownerId) return 'owner';

  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'admin';
  if (member.permissions.has(PermissionFlagsBits.BanMembers)) return 'admin';
  if (member.permissions.has(PermissionFlagsBits.KickMembers)) return 'mod';
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return 'junior_mod';

  return 'none';
}

function getStaffLevelRank(level) {
  const ranks = {
    none: 0,
    helper: 1,
    junior_mod: 2,
    mod: 3,
    admin: 4,
    owner: 5
  };

  return ranks[level] || 0;
}

function getRequiredStaffLevel(action) {
  const requirements = {
    view_dashboard: 'junior_mod',
    view_cases: 'junior_mod',
    view_case_detail: 'junior_mod',

    warn: 'junior_mod',
    add_case_note: 'junior_mod',

    timeout: 'mod',
    remove_timeout: 'mod',

    kick: 'admin',
    ban: 'admin',
    remove_warning: 'admin',
    edit_case: 'admin',

    bulk_warn: 'admin',
    bulk_timeout: 'admin',
    bulk_kick: 'admin',
    bulk_ban: 'owner'
  };

  return requirements[action] || 'owner';
}

function canUseModAction(member, guild, action) {
  const staffLevel = getStaffLevel(member, guild);
  const requiredLevel = getRequiredStaffLevel(action);

  return getStaffLevelRank(staffLevel) >= getStaffLevelRank(requiredLevel);
}

function getModActionDeniedMessage(action) {
  const requiredLevel = getRequiredStaffLevel(action);
  return `❌ You do not have permission to use this action. Required level: ${requiredLevel}.`;
}

// =========================
// 🧰 Generic Helpers
// =========================
function ephemeralError(content) {
  return {
    content,
    flags: MessageFlags.Ephemeral
  };
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({
        ...payload,
        flags: payload.flags ?? MessageFlags.Ephemeral
      });
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error('safeReply failed:', error);
    return null;
  }
}

async function safeUpdate(interaction, payload) {
  try {
    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      return await interaction.update(payload);
    }

    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }

    return await safeReply(interaction, {
      ...payload,
      flags: payload.flags ?? MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('safeUpdate failed:', error);
    return null;
  }
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }

    return await safeReply(interaction, {
      ...payload,
      flags: payload.flags ?? MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('safeEditReply failed:', error);
    return null;
  }
}

function buildConfirmRow(confirmId, cancelId = 'mod_cancel_action') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function parseConfirmActionContext(customId) {
  const parts = customId.split(':');

  return {
    token: parts[1],
    context: normalizeDashboardContext({
      view: parts[2] || 'overview',
      actionFilter: parts[3] || 'all',
      statusFilter: parts[4] || 'all',
      page: Number(parts[5]) || 0
    })
  };
}

function parseDuration(input) {
  const value = String(input || '').trim().toLowerCase();
  const match = value.match(/^(\d+)\s*(m|h|d)$/);

  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const unit = match[2];
  const map = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * map[unit];
}

function getWarningExpiry(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value === 'never') return null;

  const match = value.match(/^(\d+)\s*(d|w|m)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isInteger(amount) || amount <= 0) return null;

  const day = 24 * 60 * 60 * 1000;
  const map = {
    d: day,
    w: 7 * day,
    m: 30 * day
  };

  return new Date(Date.now() + amount * map[unit]).toISOString();
}

async function fetchTarget(guild, id) {
  if (!id || id === 'none') return null;

  try {
    return await guild.members.fetch(id);
  } catch {
    return null;
  }
}

async function findMemberByQuery(guild, query) {
  const cleaned = String(query || '').trim().toLowerCase();

  if (/^\d{17,20}$/.test(cleaned)) {
    return fetchTarget(guild, cleaned);
  }

  await guild.members.fetch();

  const exactTag = guild.members.cache.find(
    member => member.user.tag?.toLowerCase() === cleaned
  );
  if (exactTag) return exactTag;

  const exactUsername = guild.members.cache.find(
    member => member.user.username?.toLowerCase() === cleaned
  );
  if (exactUsername) return exactUsername;

  const exactDisplayName = guild.members.cache.find(
    member => member.displayName?.toLowerCase() === cleaned
  );
  if (exactDisplayName) return exactDisplayName;

  const partial = guild.members.cache.find(member => {
    const tag = member.user.tag?.toLowerCase() || '';
    const username = member.user.username?.toLowerCase() || '';
    const displayName = member.displayName?.toLowerCase() || '';

    return (
      tag.includes(cleaned) ||
      username.includes(cleaned) ||
      displayName.includes(cleaned)
    );
  });

  return partial || null;
}

function checkHierarchy(interaction, target) {
  if (!target) return '❌ Could not find that member.';
  if (target.id === interaction.user.id) return '❌ You cannot moderate yourself.';
  if (target.id === interaction.guild.ownerId) return '❌ Cannot moderate server owner.';

  if (
    interaction.member.roles.highest.position <= target.roles.highest.position &&
    interaction.guild.ownerId !== interaction.member.id
  ) {
    return '❌ Target has equal or higher role.';
  }

  if (
    interaction.guild.members.me.roles.highest.position <= target.roles.highest.position
  ) {
    return '❌ My role is too low to moderate this user.';
  }

  return null;
}

function checkHierarchyForBulk(actorMember, botMember, guildOwnerId, targetMember, actorUserId) {
  if (!targetMember) return 'User not found.';
  if (targetMember.id === actorUserId) return 'Cannot target yourself.';
  if (targetMember.id === guildOwnerId) return 'Cannot target server owner.';

  const actorIsOwner = actorUserId === guildOwnerId;

  if (
    !actorIsOwner &&
    actorMember.roles.highest.position <= targetMember.roles.highest.position
  ) {
    return 'Target has equal or higher role.';
  }

  if (
    !botMember ||
    botMember.roles.highest.position <= targetMember.roles.highest.position
  ) {
    return 'Bot role is too low.';
  }

  return null;
}

function getStatusLabel(modCase) {
  const status = modCase.status || 'active';
  if (status === 'reversed') return '🔁 Reversed';
  if (status === 'expired') return '⌛ Expired';
  return '🟢 Active';
}

function formatCaseSummary(modCase) {
  return `#${modCase.caseId} • ${modCase.action} • ${getStatusLabel(modCase)} • <t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:R>`;
}

async function syncExpiredWarningsToCases(guildId) {
  const expiredWarnings = purgeExpiredWarnings(guildId);

  for (const warning of expiredWarnings) {
    updateCaseStatus(guildId, warning.caseId, 'expired');
  }
}

// =========================
// 🎨 Modal / Component Builders
// =========================
function buildActionSelect(targetId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mod_action_select:${targetId || 'none'}`)
        .setPlaceholder('Choose a moderation action')
        .setDisabled(!targetId)
        .addOptions(
          { label: 'Warn', value: 'warn', emoji: '⚠️' },
          { label: 'Timeout', value: 'timeout', emoji: '⏳' },
          { label: 'Kick', value: 'kick', emoji: '👢' },
          { label: 'Ban', value: 'ban', emoji: '🔨' },
          { label: 'Remove Warning', value: 'remove-warning', emoji: '🗑️' },
          { label: 'Remove Timeout', value: 'remove-timeout', emoji: '✅' }
        )
    )
  ];
}

function buildReasonModal(
  customId,
  title,
  includeDays = false,
  includeDuration = false,
  includeWarnExpiry = false
) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title);

  const rows = [];

  if (includeDays) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Delete message days (0-7)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(1)
      )
    );
  }

  if (includeDuration) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Duration (10m, 1h, 1d)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1h')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
  }

  if (includeWarnExpiry) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('warn_expiry')
          .setLabel('Warn expiry (7d, 2w, 1m, or never)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('never')
          .setRequired(false)
          .setMaxLength(10)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the moderation reason')
        .setRequired(true)
        .setMaxLength(500)
    )
  );

  modal.addComponents(...rows);
  return modal;
}

function buildBulkModal(type) {
  const titleMap = {
    warn: 'Bulk Warn',
    timeout: 'Bulk Timeout',
    kick: 'Bulk Kick',
    ban: 'Bulk Ban'
  };

  const modal = new ModalBuilder()
    .setCustomId(`mod_submit_bulk_${type}`)
    .setTitle(titleMap[type] || 'Bulk Moderation');

  const rows = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('users')
        .setLabel('User IDs (comma separated)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('123456789012345678, 987654321098765432')
        .setRequired(true)
    )
  ];

  if (type === 'timeout') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Duration (10m, 1h, 1d)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1h')
          .setRequired(true)
      )
    );
  }

  if (type === 'ban') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Delete message days (0-7)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0')
          .setRequired(true)
          .setMaxLength(1)
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the moderation reason')
        .setRequired(true)
    )
  );

  modal.addComponents(...rows);
  return modal;
}

function buildCaseIdModal(customId, title, label = 'Case ID') {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('case_id')
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1')
        .setRequired(true)
        .setMaxLength(10)
    )
  );

  return modal;
}

function buildEditCaseModal(customId) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Edit Case');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('case_id')
        .setLabel('Case ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1')
        .setRequired(true)
        .setMaxLength(10)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('New Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the updated moderation reason')
        .setRequired(true)
        .setMaxLength(500)
    )
  );

  return modal;
}

function buildCaseNoteModal(customId, existingNote = '') {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existingNote ? 'Edit Case Note' : 'Add Case Note');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Staff Note')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Add internal staff-only context for this case')
        .setRequired(false)
        .setMaxLength(1000)
        .setValue(String(existingNote || '').slice(0, 1000))
    )
  );

  return modal;
}

function buildCaseFilterButtons(targetId, actionFilter = 'all', statusFilter = 'all', page = 0) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:${statusFilter}:${page}`)
        .setLabel('All')
        .setStyle(actionFilter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:warn:${statusFilter}:${page}`)
        .setLabel('Warns')
        .setStyle(actionFilter === 'warn' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:timeout:${statusFilter}:${page}`)
        .setLabel('Timeouts')
        .setStyle(actionFilter === 'timeout' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:note:${statusFilter}:${page}`)
        .setLabel('Notes')
        .setStyle(actionFilter === 'note' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:active:${page}`)
        .setLabel('Active')
        .setStyle(statusFilter === 'active' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:reversed:${page}`)
        .setLabel('Reversed')
        .setStyle(statusFilter === 'reversed' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:expired:${page}`)
        .setLabel('Expired')
        .setStyle(statusFilter === 'expired' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  ];
}

function buildCasesPageButtons(targetId, page, totalPages, actionFilter = 'all', statusFilter = 'all') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page - 1}`)
        .setLabel('Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  ];
}

function buildCaseDetailButtons(modCase) {
  const isWarning = modCase.action === 'warn';
  const isTimeout = modCase.action === 'timeout';
  const reversedOrExpired = modCase.status === 'reversed' || modCase.status === 'expired';
  const hasNote = Boolean(modCase.note && String(modCase.note).trim());

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_reverse_warning:${modCase.caseId}`)
        .setLabel('Reverse Warning')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isWarning || reversedOrExpired),
      new ButtonBuilder()
        .setCustomId(`mod_case_reverse_timeout:${modCase.caseId}`)
        .setLabel('Reverse Timeout')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isTimeout || reversedOrExpired),
      new ButtonBuilder()
        .setCustomId(`mod_case_note:${modCase.caseId}`)
        .setLabel(hasNote ? 'Edit Note' : 'Add Note')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildCasesPageEmbed(target, cases, page, totalPages, actionFilter = 'all', statusFilter = 'all') {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📜 Cases for ${target.user.tag}`)
    .setDescription(
      cases.length
        ? cases.map(entry =>
            `**#${entry.caseId}** • ${entry.action}\nStatus: ${getStatusLabel(entry)}\nReason: ${entry.reason || 'No reason provided'}\n<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
          ).join('\n\n')
        : 'No cases found.'
    )
    .setFooter({
      text: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}`
    })
    .setTimestamp();
}

function getBulkActionProgressEmbed({
  actionLabel,
  total,
  processed,
  successCount,
  failCount
}) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`⚙️ ${actionLabel} Progress`)
    .setDescription('Bulk moderation is running...')
    .addFields(
      { name: 'Processed', value: `${processed}/${total}`, inline: true },
      { name: 'Success', value: String(successCount), inline: true },
      { name: 'Failed', value: String(failCount), inline: true }
    )
    .setTimestamp();
}

function getBulkActionSummaryEmbed({
  actionLabel,
  total,
  success,
  failed
}) {
  return new EmbedBuilder()
    .setColor(failed.length ? '#ED4245' : '#57F287')
    .setTitle(`✅ ${actionLabel} Complete`)
    .addFields(
      { name: 'Total Targets', value: String(total), inline: true },
      { name: 'Successful', value: String(success.length), inline: true },
      { name: 'Failed', value: String(failed.length), inline: true },
      {
        name: 'Successes',
        value: success.length ? success.join('\n').slice(0, 1024) : 'None',
        inline: false
      },
      {
        name: 'Failures',
        value: failed.length ? failed.join('\n').slice(0, 1024) : 'None',
        inline: false
      }
    )
    .setTimestamp();
}

// =========================
// 📊 Dashboard Builders
// =========================
const allowedViews = new Set(['overview', 'actions', 'cases', 'tools', 'analytics']);

function buildDashboardNav(targetId, activeView = 'overview') {
  const items = [
    { view: 'overview', label: 'Overview' },
    { view: 'actions', label: 'Actions' },
    { view: 'cases', label: 'Cases' },
    { view: 'tools', label: 'Tools' },
    { view: 'analytics', label: 'Analytics' }
  ];

return [
  new ActionRowBuilder().addComponents(
    items.map(item =>
      new ButtonBuilder()
        .setCustomId(`mod_dashboard:${targetId || 'none'}:${item.view}`)
        .setLabel(item.label)
        .setStyle(
          activeView === item.view
            ? ButtonStyle.Primary   // 🔥 active tab highlighted
            : ButtonStyle.Secondary
        )
    )
  )
];
}

function getActionCount(cases, action) {
  return cases.filter(entry => entry.action === action).length;
}

function getStatusCount(cases, status) {
  return cases.filter(entry => (entry.status || 'active') === status).length;
}

function buildTopList(itemsMap, limit = 5, formatter = (id, count) => `${id} — ${count}`) {
  return Object.entries(itemsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => formatter(id, count));
}

function getModerationAnalytics(guildId) {
  const allCases = getAllCases(guildId) || [];

  const moderatorCounts = {};
  const userCounts = {};

  for (const modCase of allCases) {
    moderatorCounts[modCase.moderatorId] = (moderatorCounts[modCase.moderatorId] || 0) + 1;
    userCounts[modCase.userId] = (userCounts[modCase.userId] || 0) + 1;
  }

  return {
    totalCases: allCases.length,
    activeCases: getStatusCount(allCases, 'active'),
    reversedCases: getStatusCount(allCases, 'reversed'),
    expiredCases: getStatusCount(allCases, 'expired'),

    warnCount: getActionCount(allCases, 'warn'),
    timeoutCount: getActionCount(allCases, 'timeout'),
    kickCount: getActionCount(allCases, 'kick'),
    banCount: getActionCount(allCases, 'ban'),
    unwarnCount: getActionCount(allCases, 'unwarn'),
    removeTimeoutCount: getActionCount(allCases, 'remove-timeout'),

    topModerators: buildTopList(
      moderatorCounts,
      5,
      (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`
    ),

    topUsers: buildTopList(
      userCounts,
      5,
      (id, count) => `<@${id}> • ${count} case${count === 1 ? '' : 's'}`
    ),

    recentCases: allCases
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
  };
}

function buildOverviewEmbed(guild, moderator, target, stats = {}) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Moderation Dashboard')
    .setDescription(
      target
        ? `Managing **${target.user.tag}**`
        : 'No user selected yet. Use **Select User** to begin.'
    )
    .addFields(
      {
        name: 'Moderator',
        value: `${moderator}`,
        inline: true
      },
      {
        name: 'Warnings',
        value: target ? String(stats.warningCount ?? 0) : '—',
        inline: true
      },
      {
        name: 'Cases',
        value: target ? String(stats.caseCount ?? 0) : '—',
        inline: true
      },
      {
        name: 'Latest Case',
        value: stats.lastCaseSummary || 'No cases found.',
        inline: false
      }
    )
    .setTimestamp();
}

function buildAnalyticsEmbed(guild, analytics) {
  const recentCasesText = analytics.recentCases.length
    ? analytics.recentCases.map(entry =>
        `**#${entry.caseId}** • ${entry.action} • <@${entry.userId}> • <t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
      ).join('\n')
    : 'No recent cases.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📊 Moderation Analytics')
    .setDescription(`Analytics for **${guild.name}**`)
    .addFields(
      {
        name: 'Case Summary',
        value: [
          `Total: **${analytics.totalCases}**`,
          `Active: **${analytics.activeCases}**`,
          `Reversed: **${analytics.reversedCases}**`,
          `Expired: **${analytics.expiredCases}**`
        ].join('\n'),
        inline: true
      },
      {
        name: 'Action Breakdown',
        value: [
          `Warns: **${analytics.warnCount}**`,
          `Timeouts: **${analytics.timeoutCount}**`,
          `Kicks: **${analytics.kickCount}**`,
          `Bans: **${analytics.banCount}**`,
          `Unwarns: **${analytics.unwarnCount}**`,
          `Remove Timeouts: **${analytics.removeTimeoutCount}**`
        ].join('\n'),
        inline: true
      },
      {
        name: 'Top Moderators',
        value: analytics.topModerators.length
          ? analytics.topModerators.join('\n').slice(0, 1024)
          : 'No moderator data yet.',
        inline: false
      },
      {
        name: 'Top Moderated Users',
        value: analytics.topUsers.length
          ? analytics.topUsers.join('\n').slice(0, 1024)
          : 'No user data yet.',
        inline: false
      },
      {
        name: 'Recent Cases',
        value: recentCasesText.slice(0, 1024),
        inline: false
      }
    )
    .setTimestamp();
}

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
        .setLabel('Warn')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canWarn),
      new ButtonBuilder()
        .setCustomId(`mod_open_timeout:${targetId || 'none'}`)
        .setLabel('Timeout')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canTimeout),
      new ButtonBuilder()
        .setCustomId(`mod_open_kick:${targetId || 'none'}`)
        .setLabel('Kick')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !canKick),
      new ButtonBuilder()
        .setCustomId(`mod_open_ban:${targetId || 'none'}`)
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!targetId || !canBan)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_remove_warning:${targetId || 'none'}`)
        .setLabel('Remove Warning')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canRemoveWarning),
      new ButtonBuilder()
        .setCustomId(`mod_remove_timeout:${targetId || 'none'}`)
        .setLabel('Remove Timeout')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canRemoveTimeout),
      new ButtonBuilder()
        .setCustomId(`mod_refresh:${targetId || 'none'}:overview`)
        .setLabel('Refresh')
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
        .setLabel('Select User')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_case_detail:${targetId || 'none'}`)
        .setLabel('Case Detail')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canViewCaseDetail),
      new ButtonBuilder()
        .setCustomId(`mod_edit_case:${targetId || 'none'}`)
        .setLabel('Edit Case')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!targetId || !canEditCase)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mod_bulk_warn')
        .setLabel('Bulk Warn')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkWarn),
      new ButtonBuilder()
        .setCustomId('mod_bulk_timeout')
        .setLabel('Bulk Timeout')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkTimeout),
      new ButtonBuilder()
        .setCustomId('mod_bulk_kick')
        .setLabel('Bulk Kick')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canBulkKick),
      new ButtonBuilder()
        .setCustomId('mod_bulk_ban')
        .setLabel('Bulk Ban')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canBulkBan)
    )
  ];
}

async function buildDashboardPayload(
  interaction,
  target,
  view = 'overview',
  options = {}
) {
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
        .setColor('#5865F2')
        .setTitle('⚖️ Moderation Actions')
        .setDescription(
          target
            ? `Choose an action for **${target.user.tag}**`
            : 'Select a user first.'
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
      embeds.push(
        buildCasesPageEmbed(target, pageCases, page, totalPages, actionFilter, statusFilter)
      );
      components.push(
        ...buildCasesPageButtons(target.id, page, totalPages, actionFilter, statusFilter),
        ...buildCaseFilterButtons(target.id, actionFilter, statusFilter, page)
      );
    } else {
      embeds.push(
        new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📜 Cases')
          .setDescription('Select a user first.')
          .setTimestamp()
      );
    }
  }

  if (safeView === 'tools') {
    embeds.push(
      new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🧰 Moderation Tools')
        .setDescription('Utility actions and bulk moderation.')
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

// =========================
// 🔄 Dashboard Context
// =========================
function getDefaultDashboardContext() {
  return {
    view: 'overview',
    actionFilter: 'all',
    statusFilter: 'all',
    page: 0
  };
}

function normalizeDashboardContext(context = {}) {
  return {
    view: context.view || 'overview',
    actionFilter: context.actionFilter || 'all',
    statusFilter: context.statusFilter || 'all',
    page: Number.isInteger(context.page) ? context.page : Number(context.page) || 0
  };
}

async function refreshDashboard(interaction, target, context = {}) {
  const safeContext = normalizeDashboardContext(context);

  const payload = await buildDashboardPayload(
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
    } else {
      await safeEditReply(interaction, payload);
    }
  } catch (error) {
    console.error('Failed to refresh moderation dashboard message:', error);
  }
}

// =========================
// ⚙️ Bulk Actions
// =========================
async function runBulkAction(interaction, options) {
  const {
    actionType,
    ids,
    reason,
    durationRaw = null,
    deleteDays = 0
  } = options;

  const actionLabelMap = {
    warn: 'Bulk Warn',
    timeout: 'Bulk Timeout',
    kick: 'Bulk Kick',
    ban: 'Bulk Ban'
  };

  const actionLabel = actionLabelMap[actionType] || 'Bulk Moderation';
  const uniqueIds = [...new Set(ids.map(id => id.trim()).filter(Boolean))];

  if (!uniqueIds.length) {
    return safeReply(interaction, {
      content: '❌ No valid user IDs.',
      flags: MessageFlags.Ephemeral
    });
  }

  let durationMs = null;

  if (actionType === 'timeout') {
    durationMs = parseDuration(durationRaw);
    if (!durationMs) {
      return safeReply(interaction, {
        content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
        flags: MessageFlags.Ephemeral
      });
    }

    const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeoutMs) {
      return safeReply(interaction, {
        content: '❌ Timeout cannot exceed 28 days.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (actionType === 'ban') {
    if (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7) {
      return safeReply(interaction, {
        content: '❌ Delete message days must be 0-7.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const total = uniqueIds.length;
  const success = [];
  const failed = [];

  await safeReply(interaction, {
    embeds: [
      getBulkActionProgressEmbed({
        actionLabel,
        total,
        processed: 0,
        successCount: 0,
        failCount: 0
      })
    ],
    flags: MessageFlags.Ephemeral
  });

  const actorMember = interaction.member;
  const botMember = interaction.guild.members.me;

  for (let index = 0; index < uniqueIds.length; index += 1) {
    const id = uniqueIds[index];

    try {
      const member = await interaction.guild.members.fetch(id);

      const hierarchyError = checkHierarchyForBulk(
        actorMember,
        botMember,
        interaction.guild.ownerId,
        member,
        interaction.user.id
      );

      if (hierarchyError) {
        failed.push(`❌ ${id} — ${hierarchyError}`);
      } else if (actionType === 'warn') {
        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'warn',
          reason
        });

        addWarning({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          reason,
          caseId: modCase.caseId
        });

        let escalatedCase = null;
        let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };

        try {
          repeatInfo = getRepeatReasonInfo({
            guildId: interaction.guild.id,
            userId: member.id,
            reason
          }) || repeatInfo;
        } catch (error) {
          console.error('Repeat reason check failed during bulk warn:', error);
        }

        try {
          escalatedCase = await handleEscalation({
            guild: interaction.guild,
            member,
            moderator: interaction.user,
            reason
          });
        } catch (error) {
          console.error('Escalation failed during bulk warn:', error);
        }

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Warn',
          reason,
          caseId: modCase.caseId,
          metadata: {
            repeatPattern: Boolean(repeatInfo.isRepeatPattern),
            repeatCount: repeatInfo.repeatCount || 0,
            escalatedAction: escalatedCase?.action || null,
            escalatedCaseId: escalatedCase?.caseId || null
          }
        });

        success.push(`⚠️ ${member.user.tag}`);
      } else if (actionType === 'timeout') {
        await member.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'timeout',
          reason,
          metadata: { duration: durationRaw }
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Timeout',
          reason,
          caseId: modCase.caseId,
          metadata: { duration: durationRaw }
        });

        success.push(`⏳ ${member.user.tag}`);
      } else if (actionType === 'kick') {
        await member.kick(`${reason} | By ${interaction.user.tag}`);

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'kick',
          reason
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Kick',
          reason,
          caseId: modCase.caseId
        });

        success.push(`👢 ${member.user.tag}`);
      } else if (actionType === 'ban') {
        await member.ban({
          deleteMessageSeconds: deleteDays * 24 * 60 * 60,
          reason: `${reason} | By ${interaction.user.tag}`
        });

        const modCase = createCase({
          guildId: interaction.guild.id,
          userId: member.id,
          moderatorId: interaction.user.id,
          action: 'ban',
          reason,
          metadata: { deleteDays }
        });

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Ban',
          reason,
          caseId: modCase.caseId,
          metadata: { deleteDays }
        });

        success.push(`🔨 ${member.user.tag}`);
      } else {
        failed.push(`❌ ${id} — Unknown action.`);
      }
    } catch (error) {
      failed.push(`❌ ${id} — ${error?.message || 'Failed to process.'}`);
    }

    if ((index + 1) % 2 === 0 || index === uniqueIds.length - 1) {
      await safeEditReply(interaction, {
        embeds: [
          getBulkActionProgressEmbed({
            actionLabel,
            total,
            processed: index + 1,
            successCount: success.length,
            failCount: failed.length
          })
        ]
      });
    }
  }

  return safeEditReply(interaction, {
    embeds: [
      getBulkActionSummaryEmbed({
        actionLabel,
        total,
        success,
        failed
      })
    ]
  });
}

// =========================
// 🧾 Pending Actions
// =========================
async function executePendingAction(interaction, token, returnContext = {}) {
  const safeReturnContext = normalizeDashboardContext(returnContext);
  const pending = getPendingAction(interaction.guild.id, token);

  if (!pending) {
    return safeReply(
      interaction,
      ephemeralError('❌ That pending action has expired or could not be found.')
    );
  }

  if (pending.moderatorId !== interaction.user.id) {
    return safeReply(
      interaction,
      ephemeralError('❌ Only the moderator who created this action can confirm it.')
    );
  }

  const target = await fetchTarget(interaction.guild, pending.targetId);
  const error = checkHierarchy(interaction, target);

  if (error && pending.type !== 'remove-warning') {
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError(error));
  }

  try {
    if (pending.type === 'ban') {
      await target.ban({
        deleteMessageSeconds: pending.payload.deleteDays * 24 * 60 * 60,
        reason: `${pending.payload.reason} | By ${interaction.user.tag}`
      });

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'ban',
        reason: pending.payload.reason,
        metadata: { deleteDays: pending.payload.deleteDays }
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Ban',
        reason: pending.payload.reason,
        caseId: modCase.caseId,
        metadata: { deleteDays: pending.payload.deleteDays }
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Banned **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(interaction, target, safeReturnContext);
      return true;
    }

    if (pending.type === 'kick') {
      await target.kick(`${pending.payload.reason} | By ${interaction.user.tag}`);

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'kick',
        reason: pending.payload.reason
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Kick',
        reason: pending.payload.reason,
        caseId: modCase.caseId
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Kicked **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(interaction, target, safeReturnContext);
      return true;
    }

    if (pending.type === 'remove-warning') {
      const removed = deleteWarningByCaseId(interaction.guild.id, pending.payload.caseId);

      if (!removed) {
        deletePendingAction(interaction.guild.id, token);
        return safeReply(interaction, ephemeralError('❌ Failed to remove warning.'));
      }

      const sourceCase = getCaseById(interaction.guild.id, pending.payload.caseId);
      if (sourceCase) {
        updateCaseStatus(interaction.guild.id, pending.payload.caseId, 'reversed');
      }

      const userId = sourceCase?.userId || pending.targetId;

      const unwindCase = createCase({
        guildId: interaction.guild.id,
        userId,
        moderatorId: interaction.user.id,
        action: 'unwarn',
        reason: `Removed warning from case #${pending.payload.caseId}`,
        relatedCaseId: pending.payload.caseId,
        status: 'reversed'
      });

      const logTarget = target || await fetchTarget(interaction.guild, userId);

      if (logTarget) {
        await sendModLog({
          guild: interaction.guild,
          target: logTarget,
          moderator: interaction.user,
          action: 'Unwarn',
          reason: `Removed warning from case #${pending.payload.caseId}`,
          caseId: unwindCase.caseId
        });
      }

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `🗑️ Removed warning linked to **Case #${pending.payload.caseId}**.`,
        embeds: [],
        components: []
      });

      if (logTarget) {
        await refreshDashboard(interaction, logTarget, safeReturnContext);
      }

      return true;
    }

    if (pending.type === 'remove-timeout') {
      await target.timeout(null, `Timeout removed by ${interaction.user.tag}`);

      const reversedSourceCaseId = pending.payload.sourceCaseId || null;
      if (reversedSourceCaseId) {
        updateCaseStatus(interaction.guild.id, reversedSourceCaseId, 'reversed');
      }

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'remove-timeout',
        reason: reversedSourceCaseId
          ? `Removed timeout from case #${reversedSourceCaseId}`
          : 'Timeout removed from panel',
        relatedCaseId: reversedSourceCaseId,
        status: 'reversed'
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Remove Timeout',
        reason: modCase.reason,
        caseId: modCase.caseId
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `✅ Removed timeout from **${target.user.tag}** • Case #${modCase.caseId}`,
        embeds: [],
        components: []
      });

      await refreshDashboard(interaction, target, safeReturnContext);
      return true;
    }

    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError('❌ Unknown pending action type.'));
  } catch (err) {
    console.error('Pending action execution error:', err);
    deletePendingAction(interaction.guild.id, token);
    return safeReply(interaction, ephemeralError('❌ Failed to complete that action.'));
  }
}

// =========================
// 🖱 Button Handler
// =========================
async function handleModButton(interaction) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  if (!hasModPermission(interaction.member)) {
    return safeReply(interaction, ephemeralError('❌ No permission to use moderation panel.'));
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('mod_action_select:')) {
      const [, targetId] = interaction.customId.split(':');
      const selected = interaction.values[0];

      if (selected === 'warn') {
        return interaction.showModal(
          buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true)
        );
      }

      if (selected === 'timeout') {
        return interaction.showModal(
          buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true)
        );
      }

      if (selected === 'kick') {
        return interaction.showModal(
          buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User')
        );
      }

      if (selected === 'ban') {
        return interaction.showModal(
          buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false)
        );
      }

      if (selected === 'remove-warning') {
        return interaction.showModal(
          buildCaseIdModal(
            `mod_submit_remove_warning:${targetId}`,
            'Remove Warning',
            'Warning Case ID'
          )
        );
      }

      if (selected === 'remove-timeout') {
        const target = await fetchTarget(interaction.guild, targetId);
        const error = checkHierarchy(interaction, target);

        if (error) {
          return safeReply(interaction, ephemeralError(error));
        }

        const token = createPendingAction(interaction.guild.id, {
          moderatorId: interaction.user.id,
          targetId,
          type: 'remove-timeout',
          payload: {}
        });

        return safeReply(interaction, {
          content: `Remove timeout from **${target.user.tag}**?`,
          components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
          flags: MessageFlags.Ephemeral
        });
      }
    }

    return false;
  }

  if (interaction.customId === 'mod_cancel_action') {
    return safeReply(interaction, {
      content: 'Cancelled.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_select_user') {
    const modal = new ModalBuilder()
      .setCustomId('mod_select_user_modal')
      .setTitle('Select Member');

    const input = new TextInputBuilder()
      .setCustomId('target_user_query')
      .setLabel('User ID, username, tag, or display name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('123456789012345678 or TwoToneTaj')
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'mod_bulk_warn') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_warn')) {
      return safeReply(interaction, ephemeralError('❌ No permission to use bulk warn.'));
    }
    return interaction.showModal(buildBulkModal('warn'));
  }

  if (interaction.customId === 'mod_bulk_timeout') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_timeout')) {
      return safeReply(interaction, ephemeralError('❌ No permission to use bulk timeout.'));
    }
    return interaction.showModal(buildBulkModal('timeout'));
  }

  if (interaction.customId === 'mod_bulk_kick') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_kick')) {
      return safeReply(interaction, ephemeralError('❌ No permission to use bulk kick.'));
    }
    return interaction.showModal(buildBulkModal('kick'));
  }

  if (interaction.customId === 'mod_bulk_ban') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_ban')) {
      return safeReply(interaction, ephemeralError('❌ No permission to use bulk ban.'));
    }
    return interaction.showModal(buildBulkModal('ban'));
  }

  if (interaction.customId.startsWith('mod_confirm_action:')) {
    const { token, context } = parseConfirmActionContext(interaction.customId);
    return executePendingAction(interaction, token, context);
  }

  if (interaction.customId.startsWith('mod_dashboard:')) {
    try {
      const [, targetId, view] = interaction.customId.split(':');
      const target = await fetchTarget(interaction.guild, targetId);
      const payload = await buildDashboardPayload(interaction, target, view);

      await interaction.update(payload);
      return true;
    } catch (error) {
      console.error('mod_dashboard button failed:', error);
      return safeReply(interaction, ephemeralError('❌ Failed to switch dashboard tab.'));
    }
  }

// 🔥 REFRESH BUTTON
if (interaction.customId.startsWith('mod_refresh:')) {
  const [, id, view = 'overview'] = interaction.customId.split(':');
  const target = await fetchTarget(interaction.guild, id);
  const payload = await buildDashboardPayload(interaction, target, view);
  return safeUpdate(interaction, payload);
}

  if (interaction.customId.startsWith('mod_case_page:')) {
    const [, targetId, actionFilter, statusFilter, pageRaw] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);

    if (!target) {
      return safeReply(interaction, ephemeralError('❌ User not found.'));
    }

    const payload = await buildDashboardPayload(interaction, target, 'cases', {
      actionFilter,
      statusFilter,
      page: Number(pageRaw) || 0
    });

    return safeUpdate(interaction, payload);
  }

  if (interaction.customId.startsWith('mod_filter_cases:')) {
    const [, targetId, actionFilter, statusFilter, pageRaw] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);

    if (!target) {
      return safeReply(interaction, ephemeralError('❌ User not found.'));
    }

    const payload = await buildDashboardPayload(interaction, target, 'cases', {
      actionFilter,
      statusFilter,
      page: Number(pageRaw) || 0
    });

    return safeUpdate(interaction, payload);
  }

  if (interaction.customId.startsWith('mod_case_reverse_warning:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'warn') {
      return safeReply(interaction, ephemeralError('❌ User not found for that case.'));
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) {
      return safeReply(interaction, ephemeralError('❌ User not found for that case.'));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-warning',
      payload: { caseId: modCase.caseId }
    });

    return safeReply(interaction, {
      content: `Reverse warning from **Case #${modCase.caseId}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_reverse_timeout:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'timeout') {
      return safeReply(interaction, ephemeralError('❌ That timeout case could not be found.'));
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) {
      return safeReply(interaction, ephemeralError('❌ User not found for that case.'));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-timeout',
      payload: { sourceCaseId: modCase.caseId }
    });

    return safeReply(interaction, {
      content: `Reverse timeout from **Case #${modCase.caseId}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_note:')) {
    const [, caseIdRaw] = interaction.customId.split(':');

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('❌ Case ID must be a number.'));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) {
      return safeReply(interaction, ephemeralError('❌ No permission to add case notes.'));
    }

    const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!existingCase) {
      return safeReply(interaction, ephemeralError('❌ Case not found.'));
    }

    return interaction.showModal(
      buildCaseNoteModal(`mod_submit_case_note:${existingCase.caseId}`, existingCase.note || '')
    );
  }

  if (interaction.customId.startsWith('mod_case_detail:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
      return safeReply(interaction, ephemeralError('❌ No permission to view case details.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('❌ No user selected.'));
    }

    return interaction.showModal(
      buildCaseIdModal(`mod_submit_case_detail:${targetId}`, 'View Case Detail')
    );
  }

  if (interaction.customId.startsWith('mod_edit_case:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) {
      return safeReply(interaction, ephemeralError('❌ No permission to edit cases.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('❌ No user selected.'));
    }

    return interaction.showModal(
      buildEditCaseModal(`mod_submit_edit_case:${targetId}`)
    );
  }

  if (interaction.customId.startsWith('mod_remove_warning:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
      return safeReply(interaction, ephemeralError('❌ No permission to remove warnings.'));
    }

    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('❌ No user selected.'));
    }

    return interaction.showModal(
      buildCaseIdModal(
        `mod_submit_remove_warning:${targetId}`,
        'Remove Warning',
        'Warning Case ID'
      )
    );
  }

  if (interaction.customId.startsWith('mod_remove_timeout:')) {
    if (!canUseModAction(interaction.member, interaction.guild, 'remove_timeout')) {
      return safeReply(interaction, ephemeralError('❌ No permission to remove timeouts.'));
    }

    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId,
      type: 'remove-timeout',
      payload: {}
    });

    return safeReply(interaction, {
      content: `Remove timeout from **${target.user.tag}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_open_')) {
    const [prefix, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return safeReply(interaction, ephemeralError('❌ No user selected.'));
    }

    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    if (prefix === 'mod_open_ban') {
      if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
        return safeReply(interaction, ephemeralError('❌ No permission to ban users.'));
      }

      return interaction.showModal(
        buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false)
      );
    }

    if (prefix === 'mod_open_kick') {
      if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
        return safeReply(interaction, ephemeralError('❌ No permission to kick users.'));
      }

      return interaction.showModal(
        buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User')
      );
    }

    if (prefix === 'mod_open_warn') {
      if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
        return safeReply(interaction, ephemeralError('❌ No permission to warn users.'));
      }

      return interaction.showModal(
        buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true)
      );
    }

    if (prefix === 'mod_open_timeout') {
      if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
        return safeReply(interaction, ephemeralError('❌ No permission to timeout users.'));
      }

      return interaction.showModal(
        buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true)
      );
    }
  }

  return false;
}

// =========================
// 🧾 Modal Handler
// =========================
async function handleModModal(interaction) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  if (!hasModPermission(interaction.member)) {
    return safeReply(interaction, ephemeralError('❌ No permission to use moderation panel.'));
  }

  if (interaction.customId === 'mod_select_user_modal') {
    const query = interaction.fields.getTextInputValue('target_user_query').trim();
    const target = await findMemberByQuery(interaction.guild, query);

    if (!target) {
      return safeReply(
        interaction,
        ephemeralError('❌ User not found by that ID, username, tag, or display name.')
      );
    }

    const payload = await buildDashboardPayload(interaction, target, 'overview');

    return safeReply(interaction, {
      ...payload,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_case_note:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const note = interaction.fields.getTextInputValue('note').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('❌ Case ID must be a number.'));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'add_case_note')) {
      return safeReply(interaction, ephemeralError('❌ No permission to add case notes.'));
    }

    const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!existingCase) {
      return safeReply(interaction, ephemeralError('❌ Case not found.'));
    }

    const updated = note
      ? updateCaseNote(interaction.guild.id, Number(caseIdRaw), note)
      : clearCaseNote(interaction.guild.id, Number(caseIdRaw));

    if (!updated) {
      return safeReply(interaction, ephemeralError('❌ Failed to update case note.'));
    }

    const target = await fetchTarget(interaction.guild, updated.userId);

    await safeReply(interaction, {
      content: note
        ? `📝 Updated note for **Case #${updated.caseId}**.`
        : `🗑️ Cleared note for **Case #${updated.caseId}**.`,
      flags: MessageFlags.Ephemeral
    });

    if (target) {
      await refreshDashboard(interaction, target, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      });
    }

    return true;
  }

  if (interaction.customId === 'mod_submit_bulk_warn') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_warn')) {
      return safeReply(interaction, ephemeralError('❌ No permission to warn users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'warn',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_timeout') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_timeout')) {
      return safeReply(interaction, ephemeralError('❌ No permission to timeout users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const durationRaw = interaction.fields.getTextInputValue('duration');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'timeout',
      ids,
      reason,
      durationRaw
    });
  }

  if (interaction.customId === 'mod_submit_bulk_kick') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_kick')) {
      return safeReply(interaction, ephemeralError('❌ No permission to kick users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'kick',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_ban') {
    if (!canUseModAction(interaction.member, interaction.guild, 'bulk_ban')) {
      return safeReply(interaction, ephemeralError('❌ No permission to ban users in bulk.'));
    }

    const ids = interaction.fields.getTextInputValue('users').split(',');
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const reason = interaction.fields.getTextInputValue('reason');

    if (!/^[0-7]$/.test(daysRaw)) {
      return safeReply(interaction, ephemeralError('❌ Delete message days must be 0-7.'));
    }

    return runBulkAction(interaction, {
      actionType: 'ban',
      ids,
      reason,
      deleteDays: Number(daysRaw)
    });
  }

  if (interaction.customId.startsWith('mod_submit_case_detail:')) {
    const [, targetId] = interaction.customId.split(':');
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('❌ Case ID must be a number.'));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'view_case_detail')) {
      return safeReply(interaction, ephemeralError('❌ No permission to view case details.'));
    }

    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase) {
      return safeReply(interaction, ephemeralError('❌ Case not found.'));
    }

    if (targetId !== 'none' && modCase.userId !== targetId) {
      return safeReply(
        interaction,
        ephemeralError('❌ That case does not belong to the currently selected user.')
      );
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🧾 Case #${modCase.caseId}`)
      .addFields(
        { name: 'Action', value: modCase.action, inline: true },
        { name: 'Status', value: getStatusLabel(modCase), inline: true },
        { name: 'User ID', value: modCase.userId, inline: true },
        { name: 'Moderator ID', value: modCase.moderatorId, inline: true },
        { name: 'Reason', value: modCase.reason || 'No reason provided', inline: false },
        {
          name: 'Created',
          value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`,
          inline: true
        },
        {
          name: 'Updated',
          value: modCase.updatedAt
            ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>`
            : 'Never',
          inline: true
        }
      )
      .setTimestamp();

    if (modCase.relatedCaseId) {
      embed.addFields({
        name: 'Related Case',
        value: `#${modCase.relatedCaseId}`,
        inline: true
      });
    }

    if (modCase.note && String(modCase.note).trim()) {
      embed.addFields({
        name: 'Staff Note',
        value: modCase.note.slice(0, 1024),
        inline: false
      });
    }

    if (modCase.metadata && Object.keys(modCase.metadata).length) {
      embed.addFields({
        name: 'Metadata',
        value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2)}\n\`\`\``,
        inline: false
      });
    }

    return safeReply(interaction, {
      embeds: [embed],
      components: buildCaseDetailButtons(modCase),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_edit_case:')) {
    const [, targetId] = interaction.customId.split(':');
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('❌ Case ID must be a number.'));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'edit_case')) {
      return safeReply(interaction, ephemeralError('❌ No permission to edit cases.'));
    }

    const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!existingCase) {
      return safeReply(interaction, ephemeralError('❌ Case not found.'));
    }

    if (targetId !== 'none' && existingCase.userId !== targetId) {
      return safeReply(
        interaction,
        ephemeralError('❌ That case does not belong to the currently selected user.')
      );
    }

    const updated = updateCaseReason(interaction.guild.id, Number(caseIdRaw), reason);
    if (!updated) {
      return safeReply(interaction, ephemeralError('❌ Failed to update case.'));
    }

    const target = await fetchTarget(interaction.guild, updated.userId);

    await safeReply(interaction, {
      content: `✏️ Updated reason for **Case #${updated.caseId}**.`,
      flags: MessageFlags.Ephemeral
    });

    if (target) {
      await refreshDashboard(interaction, target, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      });
    }

    return true;
  }

  if (interaction.customId.startsWith('mod_submit_remove_warning:')) {
    const [, targetId] = interaction.customId.split(':');
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return safeReply(interaction, ephemeralError('❌ Warning case ID must be a number.'));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'remove_warning')) {
      return safeReply(interaction, {
        content: getModActionDeniedMessage('remove_warning'),
        flags: MessageFlags.Ephemeral
      });
    }

    const warning = getWarningByCaseId(interaction.guild.id, Number(caseIdRaw));
    if (!warning) {
      return safeReply(interaction, ephemeralError('❌ Warning not found for that case ID.'));
    }

    if (targetId !== 'none' && warning.userId !== targetId) {
      return safeReply(interaction, ephemeralError('❌ User not found for that case.'));
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: warning.userId,
      type: 'remove-warning',
      payload: { caseId: Number(caseIdRaw) }
    });

    return safeReply(interaction, {
      content: `Remove warning linked to **Case #${caseIdRaw}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_ban:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'ban')) {
      return safeReply(interaction, ephemeralError('❌ No permission to ban users.'));
    }

    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();

    if (!/^[0-7]$/.test(daysRaw)) {
      return safeReply(interaction, ephemeralError('❌ Delete message days must be 0-7.'));
    }

    const deleteDays = Number(daysRaw);

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'ban',
      payload: { reason, deleteDays }
    });

    return safeReply(interaction, {
      content: `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_kick:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'kick')) {
      return safeReply(interaction, {
        content: getModActionDeniedMessage('kick'),
        flags: MessageFlags.Ephemeral
      });
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'kick',
      payload: { reason }
    });

    return safeReply(interaction, {
      content: `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`,
      components: buildConfirmRow(`mod_confirm_action:${token}:cases:all:all:0`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_warn:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'warn')) {
      return safeReply(interaction, {
        content: getModActionDeniedMessage('warn'),
        flags: MessageFlags.Ephemeral
      });
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const warnExpiryRaw = interaction.fields.getTextInputValue('warn_expiry') || 'never';
    const expiresAt = getWarningExpiry(warnExpiryRaw);

    if (warnExpiryRaw.trim().toLowerCase() !== 'never' && !expiresAt) {
      return safeReply(interaction, {
        content: '❌ Invalid warning expiry. Use `7d`, `2w`, `1m`, or `never`.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'warn',
        reason,
        metadata: { expiresAt }
      });

      addWarning({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        reason,
        caseId: modCase.caseId,
        expiresAt
      });

      let repeatInfo = { isRepeatPattern: false, repeatCount: 0 };
      let escalatedCase = null;

      try {
        repeatInfo = getRepeatReasonInfo({
          guildId: interaction.guild.id,
          userId: target.id,
          reason
        }) || repeatInfo;
      } catch (repeatError) {
        console.error('Warn repeat check failed:', repeatError);
      }

      try {
        escalatedCase = await handleEscalation({
          guild: interaction.guild,
          member: target,
          moderator: interaction.user,
          reason
        });
      } catch (escalationError) {
        console.error('Warn escalation failed:', escalationError);
      }

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Warn',
        reason,
        caseId: modCase.caseId,
        metadata: {
          expiresAt,
          repeatPattern: Boolean(repeatInfo.isRepeatPattern),
          repeatCount: repeatInfo.repeatCount || 0,
          escalatedAction: escalatedCase?.action || null,
          escalatedCaseId: escalatedCase?.caseId || null
        }
      });

      const extraLines = [];

      if (repeatInfo.isRepeatPattern) {
        extraLines.push(`🔁 Repeat reason detected (${repeatInfo.repeatCount} matching warnings)`);
      }

      if (escalatedCase) {
        extraLines.push(`⚡ Auto escalation triggered: **${escalatedCase.action}** (Case #${escalatedCase.caseId})`);
      }

      await safeReply(interaction, {
        content: [
          `⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`,
          ...extraLines
        ].join('\n'),
        flags: MessageFlags.Ephemeral
      });

      await refreshDashboard(interaction, target, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      });

      return true;
    } catch (err) {
      console.error('Warn error:', err);
      return safeReply(interaction, {
        content: '❌ Failed to warn user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.customId.startsWith('mod_submit_timeout:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return safeReply(interaction, ephemeralError(error));
    }

    if (!canUseModAction(interaction.member, interaction.guild, 'timeout')) {
      return safeReply(interaction, {
        content: getModActionDeniedMessage('timeout'),
        flags: MessageFlags.Ephemeral
      });
    }

    const durationRaw = interaction.fields.getTextInputValue('duration').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();
    const durationMs = parseDuration(durationRaw);

    if (!durationMs) {
      return safeReply(interaction, {
        content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
        flags: MessageFlags.Ephemeral
      });
    }

    const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeoutMs) {
      return safeReply(interaction, {
        content: '❌ Timeout cannot exceed 28 days.',
        flags: MessageFlags.Ephemeral
      });
    }

    try {
      await target.timeout(durationMs, `${reason} | By ${interaction.user.tag}`);

      const modCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'timeout',
        reason,
        metadata: { duration: durationRaw }
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Timeout',
        reason,
        caseId: modCase.caseId,
        metadata: { duration: durationRaw }
      });

      await safeReply(interaction, {
        content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`,
        flags: MessageFlags.Ephemeral
      });

      await refreshDashboard(interaction, target, {
        view: 'cases',
        actionFilter: 'all',
        statusFilter: 'all',
        page: 0
      });

      return true;
    } catch (err) {
      console.error('Timeout error:', err);
      return safeReply(interaction, {
        content: '❌ Failed to timeout user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  return false;
}

// =========================
// 📤 Exports
// =========================


module.exports = {
  handleModButton,
  handleModModal,
  getDefaultDashboardContext,
  buildDashboardPayload,
  refreshDashboard
};