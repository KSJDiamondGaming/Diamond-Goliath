const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const {
  getCaseById,
  getCasesForUser,
  getFilteredCases,
  getCasesByModerator,
} = require('../../core/modules/moderation/cases');

function hasModAccess(member) {
  return member.permissions.has(PermissionFlagsBits.ModerateMembers)
    || member.permissions.has(PermissionFlagsBits.KickMembers)
    || member.permissions.has(PermissionFlagsBits.BanMembers)
    || member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function trimText(text, max = 1024) {
  if (!text) return 'No data';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatStatus(status) {
  if (status === 'reversed') return '🔁 Reversed';
  if (status === 'expired') return '⌛ Expired';
  return '🟢 Active';
}

async function findMemberByQuery(guild, query) {
  const cleaned = query.trim().toLowerCase();

  if (/^\d{17,20}$/.test(cleaned)) {
    try {
      return await guild.members.fetch(cleaned);
    } catch {
      return null;
    }
  }

  await guild.members.fetch();

  return guild.members.cache.find((member) => {
    const tag = member.user.tag?.toLowerCase() || '';
    const username = member.user.username?.toLowerCase() || '';
    const displayName = member.displayName?.toLowerCase() || '';

    return (
      tag === cleaned ||
      username === cleaned ||
      displayName === cleaned ||
      tag.includes(cleaned) ||
      username.includes(cleaned) ||
      displayName.includes(cleaned)
    );
  }) || null;
}

function createCase({
  guildId,
  userId,
  moderatorId,
  action,
  reason = null,
  metadata = {},
  status = 'active',
  relatedCaseId = null,
}) {
  const createdAt = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO cases (
      guild_id,
      user_id,
      moderator_id,
      action,
      reason,
      metadata,
      status,
      related_case_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    userId,
    moderatorId,
    action,
    reason,
    JSON.stringify(metadata || {}),
    status,
    relatedCaseId,
    createdAt,
    null
  );

  return info.lastInsertRowid;
}

function addWarningRow({
  guildId,
  userId,
  moderatorId,
  reason,
  caseId,
}) {
  db.prepare(`
    INSERT INTO warnings (
      guild_id,
      user_id,
      moderator_id,
      reason,
      case_id,
      created_at,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    userId,
    moderatorId,
    reason,
    caseId,
    new Date().toISOString(),
    null
  );
}

function getWarningCasesForUser(guildId, userId) {
  return db.prepare(`
    SELECT
      c.case_id AS caseNumber,
      c.action,
      c.user_id AS targetId,
      c.moderator_id AS moderatorId,
      c.reason,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      c.status,
      w.id AS warningRowId
    FROM cases c
    LEFT JOIN warnings w
      ON w.case_id = c.case_id
      AND w.guild_id = c.guild_id
    WHERE c.guild_id = ?
      AND c.user_id = ?
      AND c.action = 'warn'
    ORDER BY c.case_id DESC
  `).all(guildId, userId).map((row) => ({
    caseNumber: row.caseNumber,
    action: 'Warn',
    targetId: row.targetId,
    moderatorId: row.moderatorId,
    reason: row.reason,
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : null,
    cleared: row.warningRowId ? false : true,
    status: row.warningRowId ? 'active' : (row.status || 'reversed'),
  }));
}

function getRecentWarningCases(guildId, limit = 15) {
  return db.prepare(`
    SELECT
      c.case_id AS caseNumber,
      c.user_id AS targetId,
      c.moderator_id AS moderatorId,
      c.reason,
      c.created_at AS createdAt,
      c.status,
      w.id AS warningRowId
    FROM cases c
    LEFT JOIN warnings w
      ON w.case_id = c.case_id
      AND w.guild_id = c.guild_id
    WHERE c.guild_id = ?
      AND c.action = 'warn'
    ORDER BY c.case_id DESC
    LIMIT ?
  `).all(guildId, limit).map((row) => ({
    caseNumber: row.caseNumber,
    targetId: row.targetId,
    moderatorId: row.moderatorId,
    reason: row.reason,
    createdAt: row.createdAt,
    cleared: !row.warningRowId,
    status: row.warningRowId ? 'active' : (row.status || 'reversed'),
  }));
}

function getActiveWarningCount(guildId, userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM warnings
    WHERE guild_id = ?
      AND user_id = ?
  `).get(guildId, userId);

  return row?.count || 0;
}

function clearSpecificWarning({
  guildId,
  userId,
  caseId,
  moderatorId,
  reason,
}) {
  const warning = db.prepare(`
    SELECT *
    FROM warnings
    WHERE guild_id = ?
      AND user_id = ?
      AND case_id = ?
  `).get(guildId, userId, caseId);

  if (!warning) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();

  db.prepare(`
    DELETE FROM warnings
    WHERE guild_id = ?
      AND user_id = ?
      AND case_id = ?
  `).run(guildId, userId, caseId);

  db.prepare(`
    UPDATE cases
    SET status = 'reversed',
        updated_at = ?,
        metadata = ?
    WHERE guild_id = ?
      AND case_id = ?
  `).run(
    now,
    JSON.stringify({
      clearedBy: moderatorId,
      clearReason: reason,
      clearedAt: now,
    }),
    guildId,
    caseId
  );

  return { ok: true, cleared: 1 };
}

function clearAllWarnings({
  guildId,
  userId,
  moderatorId,
  reason,
}) {
  const warningRows = db.prepare(`
    SELECT case_id
    FROM warnings
    WHERE guild_id = ?
      AND user_id = ?
  `).all(guildId, userId);

  if (!warningRows.length) {
    return { ok: false, reason: 'none_active' };
  }

  const now = new Date().toISOString();

  const deleteStmt = db.prepare(`
    DELETE FROM warnings
    WHERE guild_id = ?
      AND user_id = ?
      AND case_id = ?
  `);

  const updateStmt = db.prepare(`
    UPDATE cases
    SET status = 'reversed',
        updated_at = ?,
        metadata = ?
    WHERE guild_id = ?
      AND case_id = ?
  `);

  const tx = db.transaction(() => {
    for (const row of warningRows) {
      deleteStmt.run(guildId, userId, row.case_id);
      updateStmt.run(
        now,
        JSON.stringify({
          clearedBy: moderatorId,
          clearReason: reason,
          clearedAt: now,
        }),
        guildId,
        row.case_id
      );
    }
  });

  tx();

  return { ok: true, cleared: warningRows.length };
}

async function buildModStatsEmbed(interaction) {
  const guildId = interaction.guild.id;
  const recentLimit = 5;

  const totalCasesRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM cases
    WHERE guild_id = ?
  `).get(guildId);

  const totalCases = totalCasesRow?.count || 0;

  if (!totalCases) {
    return new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('❌ No Moderation Data')
      .setDescription('No moderation cases were found for this server.')
      .setTimestamp();
  }

  const actionTotals = db.prepare(`
    SELECT action, COUNT(*) AS count
    FROM cases
    WHERE guild_id = ?
    GROUP BY action
    ORDER BY count DESC
  `).all(guildId);

  const topModerators = db.prepare(`
    SELECT moderator_id, COUNT(*) AS count
    FROM cases
    WHERE guild_id = ?
    GROUP BY moderator_id
    ORDER BY count DESC
    LIMIT 5
  `).all(guildId);

  const recentCases = db.prepare(`
    SELECT case_id, action, user_id, created_at, status
    FROM cases
    WHERE guild_id = ?
    ORDER BY case_id DESC
    LIMIT ?
  `).all(guildId, recentLimit);

  const activeWarningsRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM warnings
    WHERE guild_id = ?
  `).get(guildId);

  const activeWarnings = activeWarningsRow?.count || 0;

  const totalWarnCases = actionTotals.find((r) => r.action === 'warn')?.count || 0;
  const clearedWarnings = Math.max(0, totalWarnCases - activeWarnings);

  const totalsText =
    actionTotals.map((r) => `**${r.action}**: ${r.count}`).join('\n') || 'No data';

  const topModsText =
    topModerators.map((r, i) => `**${i + 1}.** <@${r.moderator_id}> — ${r.count}`).join('\n') || 'No data';

  const recentText =
    recentCases.map((r) => {
      const status =
        r.status === 'reversed' ? '🔁' :
        r.status === 'expired' ? '⌛' : '🟢';

      return `**#${r.case_id}** • ${r.action} • \`${r.user_id}\` ${status}`;
    }).join('\n\n') || 'No recent cases';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📊 Moderation Statistics')
    .setDescription(`Overview for **${interaction.guild.name}**`)
    .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
    .addFields(
      { name: '📦 Total Cases', value: String(totalCases), inline: true },
      { name: '⚠️ Active Warns', value: String(activeWarnings), inline: true },
      { name: '🧹 Cleared Warns', value: String(clearedWarnings), inline: true },
      { name: '📈 Action Totals', value: trimText(totalsText) },
      { name: '🏆 Top Moderators', value: trimText(topModsText) },
      { name: '🕘 Recent Cases', value: trimText(recentText) }
    )
    .setTimestamp();
}

function buildMainEmbed(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ Moderation Hub')
    .setDescription('Manage moderation actions, warning history, case tools, and server moderation stats.')
    .addFields(
      {
        name: '⚡ Actions',
        value: [
          '⚠️ Warn a member',
          '🧹 Purge messages',
          '📜 View warnings',
          '🧽 Clear warnings',
          '📂 Case tools',
          '📊 Mod stats',
        ].join('\n'),
        inline: false,
      },
      {
        name: '👮 Moderator',
        value: `${interaction.user}`,
        inline: true,
      },
      {
        name: '🏠 Server',
        value: interaction.guild.name,
        inline: true,
      }
    )
    .setTimestamp();

  const icon = interaction.guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function buildMainRows(ownerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_warn_${ownerId}`)
        .setLabel('Warn')
        .setEmoji('⚠️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_purge_${ownerId}`)
        .setLabel('Purge')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`mod_viewwarnings_${ownerId}`)
        .setLabel('Warnings')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_clearwarnings_${ownerId}`)
        .setLabel('Clear')
        .setEmoji('🧽')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_cases_${ownerId}`)
        .setLabel('Case Tools')
        .setEmoji('📂')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`mod_recentwarnings_${ownerId}`)
        .setLabel('Recent Warnings')
        .setEmoji('🗂️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_stats_${ownerId}`)
        .setLabel('Mod Stats')
        .setEmoji('📊')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_refresh_${ownerId}`)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildCaseToolsEmbed(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('📂 Case Tools')
    .setDescription('Search, filter, review, and export moderation cases.')
    .addFields(
      {
        name: '🔎 Lookups',
        value: [
          'Search by case ID',
          'Search by member',
          'Search by moderator',
        ].join('\n'),
        inline: true,
      },
      {
        name: '🎛️ Filters',
        value: [
          'Recent cases',
          'Filter by action',
          'Filter by status',
        ].join('\n'),
        inline: true,
      },
      {
        name: '📦 Export',
        value: 'Export a member case history as JSON or CSV.',
        inline: false,
      }
    )
    .setTimestamp();

  const icon = interaction.guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function buildCaseToolRows(ownerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_searchcase_${ownerId}`)
        .setLabel('Search Case')
        .setEmoji('🔎')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_case_searchmember_${ownerId}`)
        .setLabel('Member Cases')
        .setEmoji('👤')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`mod_case_recent_${ownerId}`)
        .setLabel('Recent Cases')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_filteraction_${ownerId}`)
        .setLabel('Filter Action')
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_case_filterstatus_${ownerId}`)
        .setLabel('Filter Status')
        .setEmoji('🏷️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_case_moderator_${ownerId}`)
        .setLabel('Moderator Cases')
        .setEmoji('👮')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_export_${ownerId}`)
        .setLabel('Export Cases')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`mod_home_${ownerId}`)
        .setLabel('Back')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildWarningsOverviewEmbed(targetUser, warningCases, page = 0) {
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(warningCases.length / pageSize));
  const pageItems = warningCases.slice(page * pageSize, page * pageSize + pageSize);
  const activeWarnings = warningCases.filter((c) => c.cleared !== true).length;
  const clearedWarnings = warningCases.filter((c) => c.cleared === true).length;

  const description = pageItems.length
    ? pageItems.map((warn) => {
      const status = warn.cleared === true ? '🧹 Cleared' : '⚠️ Active';
      const moderator = warn.moderatorId ? `<@${warn.moderatorId}>` : 'Unknown';
      const created = warn.createdAt
        ? `<t:${Math.floor(warn.createdAt / 1000)}:R>`
        : 'Unknown time';

      return [
        `**#${warn.caseNumber}** • ${status}`,
        `👮 ${moderator} • ${created}`,
        `📝 ${trimText(warn.reason, 250)}`
      ].join('\n');
    }).join('\n\n')
    : 'No warnings found.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📜 Warnings for ${targetUser.tag}`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .setDescription(description)
    .addFields(
      { name: '⚠️ Active', value: String(activeWarnings), inline: true },
      { name: '🧹 Cleared', value: String(clearedWarnings), inline: true },
      { name: '📦 Total', value: String(warningCases.length), inline: true },
      { name: '📄 Page', value: `${page + 1}/${totalPages}`, inline: true },
    )
    .setTimestamp();
}

function buildWarningsPagerRows(ownerId, targetId, page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_warnpage_first_${ownerId}_${targetId}`)
        .setLabel('≪')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`mod_warnpage_prev_${ownerId}_${targetId}`)
        .setLabel('‹')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`mod_warnpage_label_${ownerId}_${targetId}_${page + 1}_${totalPages}`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`mod_warnpage_next_${ownerId}_${targetId}`)
        .setLabel('›')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`mod_warnpage_last_${ownerId}_${targetId}`)
        .setLabel('≫')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
    ),
    ...buildMainRows(ownerId),
  ];
}

function buildWarningCaseSummaryEmbed(guild, warningCases, title) {
  const description = warningCases.length
    ? warningCases.map((warn) => {
      const status = warn.cleared ? '🧹 Cleared' : '⚠️ Active';
      return `**#${warn.caseNumber}** • ${status}\nUser: <@${warn.targetId}>\nModerator: <@${warn.moderatorId}>\nReason: ${trimText(warn.reason, 250)}`;
    }).join('\n\n')
    : 'No matching warning cases found.';

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(title)
    .setDescription(description)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .setTimestamp();
}

function buildCasesEmbed(title, cases, footerText = null) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(title)
    .setDescription(
      cases.length
        ? cases.map((entry) =>
            `**#${entry.caseId}** • ${entry.action}\nUser: \`${entry.userId}\`\nModerator: \`${entry.moderatorId}\`\nStatus: ${formatStatus(entry.status)}\nReason: ${trimText(entry.reason || 'No reason provided', 250)}\n<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
          ).join('\n\n')
        : 'No cases found.'
    )
    .setTimestamp();

  if (footerText) embed.setFooter({ text: footerText });
  return embed;
}

function buildCaseDetailEmbed(modCase) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🧾 Case #${modCase.caseId}`)
    .addFields(
      { name: 'Action', value: modCase.action, inline: true },
      { name: 'Status', value: formatStatus(modCase.status), inline: true },
      { name: 'User ID', value: modCase.userId, inline: true },
      { name: 'Moderator ID', value: modCase.moderatorId, inline: true },
      { name: 'Reason', value: trimText(modCase.reason || 'No reason provided', 1024), inline: false },
      {
        name: 'Created',
        value: `<t:${Math.floor(new Date(modCase.createdAt).getTime() / 1000)}:F>`,
        inline: true,
      },
      {
        name: 'Updated',
        value: modCase.updatedAt
          ? `<t:${Math.floor(new Date(modCase.updatedAt).getTime() / 1000)}:F>`
          : 'Never',
        inline: true,
      }
    )
    .setTimestamp();

  if (modCase.relatedCaseId) {
    embed.addFields({
      name: 'Related Case',
      value: `#${modCase.relatedCaseId}`,
      inline: true,
    });
  }

  if (modCase.metadata && Object.keys(modCase.metadata).length) {
    const metadataText = JSON.stringify(modCase.metadata, null, 2);
    embed.addFields({
      name: 'Metadata',
      value: `\`\`\`json\n${trimText(metadataText, 900)}\n\`\`\``,
      inline: false,
    });
  }

  return embed;
}

function buildPurgeModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_purge_${ownerId}`)
    .setTitle('Purge Messages')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount (1-100)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('25')
          .setMaxLength(3)
      )
    );
}

function buildWarnModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_warn_${ownerId}`)
    .setTitle('Warn Member')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_query')
          .setLabel('User ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('123456789012345678 or username')
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Explain why this member is being warned')
          .setMaxLength(1000)
      )
    );
}

function buildWarningsLookupModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_viewwarnings_${ownerId}`)
    .setTitle('View Warning History')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_query')
          .setLabel('User ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('123456789012345678 or username')
          .setMaxLength(100)
      )
    );
}

function buildClearWarningsModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_clearwarnings_${ownerId}`)
    .setTitle('Clear Warnings')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_query')
          .setLabel('User ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('123456789012345678 or username')
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('case_number')
          .setLabel('Specific case number (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Leave blank to clear all active warnings')
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Clear reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Why are the warnings being cleared?')
          .setMaxLength(1000)
      )
    );
}

function buildCaseSearchModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_case_searchcase_${ownerId}`)
    .setTitle('Search Case')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('case_id')
          .setLabel('Case ID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('123')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
}

function buildMemberCaseModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_case_searchmember_${ownerId}`)
    .setTitle('Search Member Cases')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_query')
          .setLabel('User ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('123456789012345678 or username')
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

function buildModeratorCaseModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_case_moderator_${ownerId}`)
    .setTitle('Moderator Cases')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('moderator_query')
          .setLabel('Moderator ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Moderator name or ID')
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

function buildExportModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`mod_submit_case_export_${ownerId}`)
    .setTitle('Export Member Cases')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_query')
          .setLabel('User ID, username, tag, or display name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Member name or ID')
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('format')
          .setLabel('Format: json or csv')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('json')
          .setMaxLength(10)
      )
    );
}

function toCsv(rows) {
  const headers = [
    'caseId',
    'guildId',
    'userId',
    'moderatorId',
    'action',
    'reason',
    'status',
    'relatedCaseId',
    'createdAt',
    'updatedAt',
    'metadata',
  ];

  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  return [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => {
        const value = header === 'metadata'
          ? JSON.stringify(row[header] || {})
          : row[header];
        return escape(value);
      }).join(',')
    ),
  ].join('\n');
}

async function openModPanel(interaction) {
  const payload = {
    embeds: [buildMainEmbed(interaction)],
    components: buildMainRows(interaction.user.id),
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }

  return interaction.reply(payload);
}

async function ensurePanelOwner(interaction, ownerId) {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: '❌ You cannot use another moderator’s panel.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  if (!hasModAccess(interaction.member)) {
    await interaction.reply({
      content: '❌ You do not have permission to use this panel.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

async function handleWarn(interaction, member, reason) {
  const guild = interaction.guild;
  const targetUser = member.user;

  if (targetUser.id === interaction.user.id) {
    return interaction.reply({
      content: '❌ You cannot warn yourself.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (targetUser.id === guild.ownerId) {
    return interaction.reply({
      content: '❌ You cannot warn the server owner.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (targetUser.id === interaction.client.user.id) {
    return interaction.reply({
      content: '❌ You cannot warn the bot.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (
    interaction.member.id !== guild.ownerId &&
    member.roles.highest.position >= interaction.member.roles.highest.position
  ) {
    return interaction.reply({
      content: '❌ You cannot warn a member with the same or higher role than you.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (member.roles.highest.position >= guild.members.me.roles.highest.position) {
    return interaction.reply({
      content: '❌ I cannot warn that member because their top role is higher than or equal to mine.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const caseId = createCase({
    guildId: guild.id,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    action: 'warn',
    reason,
    metadata: {},
    status: 'active',
  });

  addWarningRow({
    guildId: guild.id,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    reason,
    caseId,
  });

  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('⚠️ Member Warned')
    .setDescription(`${targetUser} has been warned successfully.`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '📁 Warning Case', value: `#${caseId}`, inline: true },
      { name: '👤 Member', value: `${targetUser}\n\`${targetUser.id}\``, inline: true },
      { name: '🛡️ Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
      { name: '📝 Reason', value: trimText(reason), inline: false }
    )
    .setTimestamp();

  await targetUser.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle(`⚠️ You were warned in ${guild.name}`)
        .setDescription(trimText(reason, 4000))
        .addFields({
          name: 'Moderator',
          value: interaction.user.tag,
          inline: true,
        })
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setTimestamp(),
    ],
  }).catch(() => null);

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleWarningsLookup(interaction, member) {
  const warningCases = getWarningCasesForUser(interaction.guild.id, member.id);

  if (!warningCases.length) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#f1c40f')
          .setTitle('⚠️ No Warnings')
          .setDescription(`${member} has no warning history 🎉`)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp(),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const page = 0;
  const totalPages = Math.max(1, Math.ceil(warningCases.length / 5));

  return interaction.reply({
    embeds: [buildWarningsOverviewEmbed(member.user, warningCases, page)],
    components: buildWarningsPagerRows(interaction.user.id, member.id, page, totalPages),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleClearWarnings(interaction, member, caseNumberInput, reason) {
  let result;

  if (caseNumberInput) {
    result = clearSpecificWarning({
      guildId: interaction.guild.id,
      userId: member.id,
      caseId: caseNumberInput,
      moderatorId: interaction.user.id,
      reason,
    });

    if (!result.ok) {
      return interaction.reply({
        content: `❌ Case #${caseNumberInput} was not found as an active warning for ${member}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    result = clearAllWarnings({
      guildId: interaction.guild.id,
      userId: member.id,
      moderatorId: interaction.user.id,
      reason,
    });

    if (!result.ok) {
      return interaction.reply({
        content: `${member} has no active warnings to clear.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const clearCaseId = createCase({
    guildId: interaction.guild.id,
    userId: member.id,
    moderatorId: interaction.user.id,
    action: 'clearwarnings',
    reason: caseNumberInput
      ? `Cleared warning case #${caseNumberInput}. ${reason}`
      : `Cleared ${result.cleared} active warning(s). ${reason}`,
    metadata: {},
    status: 'active',
    relatedCaseId: caseNumberInput || null,
  });

  const embed = new EmbedBuilder()
    .setColor('#2ecc71')
    .setTitle('🧽 Warnings Cleared')
    .setDescription(
      caseNumberInput
        ? `Case **#${caseNumberInput}** has been cleared for ${member}.`
        : `All active warnings for ${member} have been cleared.`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: '📁 Case', value: `#${clearCaseId}`, inline: true },
      { name: '👤 Target', value: `${member}\n\`${member.id}\``, inline: true },
      { name: '🛡️ Moderator', value: `${interaction.user}\n\`${interaction.user.id}\``, inline: true },
      { name: '📌 Cleared', value: String(result.cleared), inline: true },
      { name: '📝 Reason', value: trimText(reason), inline: false }
    )
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePurge(interaction, amount) {
  const botMember = interaction.guild.members.me;

  if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: '❌ I do not have permission to manage messages in this server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const deleted = await interaction.channel.bulkDelete(amount, true);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🧹 Messages Purged')
    .setDescription(`Successfully deleted \`${deleted.size}\` message${deleted.size === 1 ? '' : 's'}.`)
    .addFields({
      name: 'Channel',
      value: `${interaction.channel}`,
      inline: true,
    })
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleExport(interaction, member, formatRaw) {
  const cases = getCasesForUser(interaction.guild.id, member.id);
  const exportDir = path.join(process.cwd(), 'data', 'moderation', 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const filePath = path.join(
    exportDir,
    `cases-${interaction.guild.id}-${member.id}.${formatRaw}`
  );

  if (formatRaw === 'csv') {
    fs.writeFileSync(filePath, toCsv(cases), 'utf8');
  } else {
    fs.writeFileSync(filePath, JSON.stringify(cases, null, 2), 'utf8');
  }

  return interaction.reply({
    content: `📦 Exported ${cases.length} case(s) for **${member.user.tag}** as ${formatRaw.toUpperCase()}.`,
    files: [new AttachmentBuilder(filePath)],
    flags: MessageFlags.Ephemeral,
  });
}

function parseOwnerIdFromCustomId(customId) {
  const parts = customId.split('_');
  return parts[parts.length - 1];
}

async function handleModPanelInteraction(interaction) {
  if (!interaction.customId.startsWith('mod_')) return false;

  const customId = interaction.customId;

  if (customId.startsWith('mod_warnpage_')) {
    const parts = customId.split('_');
    const direction = parts[2];
    const pagingOwnerId = parts[3];
    const targetId = parts[4];

    if (!await ensurePanelOwner(interaction, pagingOwnerId)) {
      return true;
    }

    const warningCases = getWarningCasesForUser(interaction.guild.id, targetId);
    const totalPages = Math.max(1, Math.ceil(warningCases.length / 5));
    const currentLabel = interaction.message.components?.[0]?.components?.[2]?.label || '1/1';
    let page = Math.max(0, (Number(currentLabel.split('/')[0]) || 1) - 1);

    if (direction === 'first') page = 0;
    if (direction === 'prev') page = Math.max(0, page - 1);
    if (direction === 'next') page = Math.min(totalPages - 1, page + 1);
    if (direction === 'last') page = totalPages - 1;

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) {
      await interaction.reply({
        content: '❌ That member is no longer in the server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.update({
      embeds: [buildWarningsOverviewEmbed(member.user, warningCases, page)],
      components: buildWarningsPagerRows(pagingOwnerId, targetId, page, totalPages),
    });
    return true;
  }

  const ownerId = parseOwnerIdFromCustomId(customId);

  if (!await ensurePanelOwner(interaction, ownerId)) {
    return true;
  }

  if (customId.startsWith(`mod_warn_${ownerId}`)) {
    await interaction.showModal(buildWarnModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_purge_${ownerId}`)) {
    await interaction.showModal(buildPurgeModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_viewwarnings_${ownerId}`)) {
    await interaction.showModal(buildWarningsLookupModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_clearwarnings_${ownerId}`)) {
    await interaction.showModal(buildClearWarningsModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_cases_${ownerId}`)) {
    await interaction.update({
      embeds: [buildCaseToolsEmbed(interaction)],
      components: buildCaseToolRows(ownerId),
    });
    return true;
  }

  if (customId.startsWith(`mod_recentwarnings_${ownerId}`)) {
    const recentWarningCases = getRecentWarningCases(interaction.guild.id, 15);

    await interaction.reply({
      embeds: [buildWarningCaseSummaryEmbed(interaction.guild, recentWarningCases, '📂 Recent Warning Cases')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (customId.startsWith(`mod_stats_${ownerId}`)) {
    const embed = await buildModStatsEmbed(interaction);
    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (
    customId.startsWith(`mod_refresh_${ownerId}`) ||
    customId.startsWith(`mod_home_${ownerId}`)
  ) {
    await interaction.update({
      embeds: [buildMainEmbed(interaction)],
      components: buildMainRows(ownerId),
    });
    return true;
  }

  if (customId.startsWith(`mod_case_searchcase_${ownerId}`)) {
    await interaction.showModal(buildCaseSearchModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_case_searchmember_${ownerId}`)) {
    await interaction.showModal(buildMemberCaseModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_case_moderator_${ownerId}`)) {
    await interaction.showModal(buildModeratorCaseModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_case_export_${ownerId}`)) {
    await interaction.showModal(buildExportModal(ownerId));
    return true;
  }

  if (customId.startsWith(`mod_case_recent_${ownerId}`)) {
    await interaction.guild.members.fetch();

    const allMembers = interaction.guild.members.cache.map((member) => member.id);
    let allCases = [];

    for (const userId of allMembers) {
      allCases.push(...getCasesForUser(interaction.guild.id, userId));
    }

    allCases = allCases.sort((a, b) => b.caseId - a.caseId).slice(0, 15);

    await interaction.reply({
      embeds: [buildCasesEmbed('📜 Recent Cases', allCases, 'Latest 15 cases')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (customId.startsWith(`mod_case_filteraction_${ownerId}`)) {
    await interaction.reply({
      content: 'Choose an action filter:',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_case_action_warn_${ownerId}`)
            .setLabel('Warns')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_action_timeout_${ownerId}`)
            .setLabel('Timeouts')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_action_note_${ownerId}`)
            .setLabel('Notes')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_action_ban_${ownerId}`)
            .setLabel('Bans')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_action_kick_${ownerId}`)
            .setLabel('Kicks')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (customId.startsWith(`mod_case_filterstatus_${ownerId}`)) {
    await interaction.reply({
      content: 'Choose a status filter:',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_case_status_active_${ownerId}`)
            .setLabel('Active')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_status_reversed_${ownerId}`)
            .setLabel('Reversed')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`mod_case_status_expired_${ownerId}`)
            .setLabel('Expired')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (customId.startsWith('mod_case_action_')) {
    const parts = customId.split('_');
    const selectedAction = parts[3];

    await interaction.guild.members.fetch();
    const memberIds = interaction.guild.members.cache.map((member) => member.id);

    let cases = [];
    for (const userId of memberIds) {
      cases.push(...getFilteredCases(interaction.guild.id, userId, { action: selectedAction }));
    }

    cases = cases.sort((a, b) => b.caseId - a.caseId).slice(0, 20);

    await interaction.reply({
      embeds: [buildCasesEmbed(`🎯 Cases filtered by action: ${selectedAction}`, cases)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (customId.startsWith('mod_case_status_')) {
    const parts = customId.split('_');
    const status = parts[3];

    await interaction.guild.members.fetch();
    const memberIds = interaction.guild.members.cache.map((member) => member.id);

    let cases = [];
    for (const userId of memberIds) {
      cases.push(...getFilteredCases(interaction.guild.id, userId, { status }));
    }

    cases = cases.sort((a, b) => b.caseId - a.caseId).slice(0, 20);

    await interaction.reply({
      embeds: [buildCasesEmbed(`🏷️ Cases filtered by status: ${status}`, cases)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}

async function handleModPanelModal(interaction) {
  if (!interaction.customId.startsWith('mod_submit_')) return false;

  const parts = interaction.customId.split('_');
  const ownerId = parts[parts.length - 1];

  if (!await ensurePanelOwner(interaction, ownerId)) {
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_purge_${ownerId}`)) {
    const amount = Number(interaction.fields.getTextInputValue('amount').trim());

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await interaction.reply({
        content: '❌ Amount must be a whole number between 1 and 100.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await handlePurge(interaction, amount);
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_warn_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('member_query').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();

    const member = await findMemberByQuery(interaction.guild, query);
    if (!member) {
      await interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await handleWarn(interaction, member, reason);
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_viewwarnings_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('member_query').trim();

    const member = await findMemberByQuery(interaction.guild, query);
    if (!member) {
      await interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await handleWarningsLookup(interaction, member);
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_clearwarnings_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('member_query').trim();
    const caseValue = interaction.fields.getTextInputValue('case_number').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim() || 'No reason provided';

    const member = await findMemberByQuery(interaction.guild, query);
    if (!member) {
      await interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    let caseNumberInput = null;
    if (caseValue) {
      caseNumberInput = Number(caseValue);
      if (!Number.isInteger(caseNumberInput) || caseNumberInput < 1) {
        await interaction.reply({
          content: '❌ Case number must be a valid positive number.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    await handleClearWarnings(interaction, member, caseNumberInput, reason);
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_case_searchcase_${ownerId}`)) {
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      await interaction.reply({
        content: '❌ Case ID must be a number.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) {
      await interaction.reply({
        content: '❌ Case not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      embeds: [buildCaseDetailEmbed(modCase)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_case_searchmember_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('member_query').trim();

    const member = await findMemberByQuery(interaction.guild, query);
    if (!member) {
      await interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const cases = getCasesForUser(interaction.guild.id, member.id);
    await interaction.reply({
      embeds: [buildCasesEmbed(`👤 Cases for ${member.user.tag}`, cases)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_case_moderator_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('moderator_query').trim();

    const moderator = await findMemberByQuery(interaction.guild, query);
    if (!moderator) {
      await interaction.reply({
        content: '❌ Moderator not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const cases = getCasesByModerator(interaction.guild.id, moderator.id).slice(0, 20);

    await interaction.reply({
      embeds: [buildCasesEmbed(`👮 Cases by ${moderator.user.tag}`, cases)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId.startsWith(`mod_submit_case_export_${ownerId}`)) {
    const query = interaction.fields.getTextInputValue('member_query').trim();
    const formatRaw = interaction.fields.getTextInputValue('format').trim().toLowerCase();

    if (!['json', 'csv'].includes(formatRaw)) {
      await interaction.reply({
        content: '❌ Format must be `json` or `csv`.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const member = await findMemberByQuery(interaction.guild, query);
    if (!member) {
      await interaction.reply({
        content: '❌ Member not found.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await handleExport(interaction, member, formatRaw);
    return true;
  }

  return false;
}

const handleModButton = handleModPanelInteraction;
const handleModModal = handleModPanelModal;

module.exports = {
  openModPanel,
  handleModPanelInteraction,
  handleModPanelModal,
  handleModButton,
  handleModModal,
};