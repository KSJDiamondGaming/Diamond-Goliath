const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { buildModPanelEmbed, buildModPanelRows } = require('./mod');
const {
  createCase,
  getCasesForUser,
  getFilteredCases,
  getCaseCountForUser,
  getCaseById,
  updateCaseReason,
  updateCaseStatus
} = require('../../utils/moderation/caseStore');
const {
  addWarning,
  getWarningCountForUser,
  getWarningByCaseId,
  deleteWarningByCaseId,
  purgeExpiredWarnings
} = require('../../utils/moderation/warningStore');
const { sendModLog } = require('../../utils/moderation/modLog');
const {
  createPendingAction,
  getPendingAction,
  deletePendingAction
} = require('../../utils/moderation/pendingActionStore');

function hasModPermission(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  );
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
  const cleaned = query.trim().toLowerCase();

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

function parseDuration(input) {
  const value = input.trim().toLowerCase();
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

async function buildPanelPayload(interaction, target) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  const warningCount = target
    ? getWarningCountForUser(interaction.guild.id, target.id)
    : undefined;

  const caseCount = target
    ? getCaseCountForUser(interaction.guild.id, target.id)
    : undefined;

  const latestCase = target
    ? getCasesForUser(interaction.guild.id, target.id)[0]
    : null;

  const embed = buildModPanelEmbed(interaction.guild, interaction.member, target, {
    warningCount,
    caseCount,
    lastCaseSummary: latestCase ? formatCaseSummary(latestCase) : null
  });

  return {
    embeds: [embed],
    components: buildModPanelRows(target?.id || null)
  };
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
    .setTitle('Edit Case Reason');

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
        .setPlaceholder('Enter the updated case reason')
        .setRequired(true)
        .setMaxLength(500)
    )
  );

  return modal;
}

function buildCaseFilterButtons(targetId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:all:0`)
        .setLabel('All')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:warn:all:0`)
        .setLabel('Warns')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:timeout:all:0`)
        .setLabel('Timeouts')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:note:all:0`)
        .setLabel('Notes')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:active:0`)
        .setLabel('Active')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:reversed:0`)
        .setLabel('Reversed')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:expired:0`)
        .setLabel('Expired')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function refreshPanelFromReply(interaction, target) {
  const payload = await buildPanelPayload(interaction, target);

  try {
    if (interaction.message) {
      await interaction.message.edit(payload);
    }
  } catch (error) {
    console.error('Failed to refresh mod panel message:', error);
  }
}

function buildCasesPageEmbed(target, cases, page, totalPages) {
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`📜 Cases for ${target.user.tag}`)
    .setDescription(
      cases.length
        ? cases.map(entry =>
            `**#${entry.caseId}** • ${entry.action}\nStatus: ${getStatusLabel(entry)}\nReason: ${entry.reason}\n<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
          ).join('\n\n')
        : 'No cases found.'
    )
    .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
    .setTimestamp();
}

function buildCasesPageButtons(targetId, page, totalPages) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_view_cases:${targetId}:${page - 1}`)
        .setLabel('Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`mod_view_cases:${targetId}:${page + 1}`)
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
        .setDisabled(!isTimeout || reversedOrExpired)
    )
  ];
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
      {
        name: 'Processed',
        value: `${processed}/${total}`,
        inline: true
      },
      {
        name: 'Success',
        value: String(successCount),
        inline: true
      },
      {
        name: 'Failed',
        value: String(failCount),
        inline: true
      }
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
      {
        name: 'Total Targets',
        value: String(total),
        inline: true
      },
      {
        name: 'Successful',
        value: String(success.length),
        inline: true
      },
      {
        name: 'Failed',
        value: String(failed.length),
        inline: true
      },
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
    return interaction.reply({
      content: '❌ No valid user IDs.',
      flags: MessageFlags.Ephemeral
    });
  }

  let durationMs = null;
  if (actionType === 'timeout') {
    durationMs = parseDuration(durationRaw);
    if (!durationMs) {
      return interaction.reply({
        content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
        flags: MessageFlags.Ephemeral
      });
    }

    const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeoutMs) {
      return interaction.reply({
        content: '❌ Timeout cannot exceed 28 days.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (actionType === 'ban') {
    if (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > 7) {
      return interaction.reply({
        content: '❌ Delete message days must be 0-7.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const total = uniqueIds.length;
  const success = [];
  const failed = [];

  await interaction.reply({
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

        await sendModLog({
          guild: interaction.guild,
          target: member,
          moderator: interaction.user,
          action: 'Bulk Warn',
          reason,
          caseId: modCase.caseId
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
      await interaction.editReply({
        embeds: [
          getBulkActionProgressEmbed({
            actionLabel,
            total,
            processed: index + 1,
            successCount: success.length,
            failCount: failed.length
          })
        ]
      }).catch(() => {});
    }
  }

  return interaction.editReply({
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

async function executePendingAction(interaction, token) {
  const pending = getPendingAction(interaction.guild.id, token);

  if (!pending) {
    return interaction.reply({
      content: '❌ That pending action has expired or could not be found.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (pending.moderatorId !== interaction.user.id) {
    return interaction.reply({
      content: '❌ Only the moderator who created this action can confirm it.',
      flags: MessageFlags.Ephemeral
    });
  }

  const target = await fetchTarget(interaction.guild, pending.targetId);
  const error = checkHierarchy(interaction, target);

  if (error) {
    deletePendingAction(interaction.guild.id, token);
    return interaction.reply({
      content: error,
      flags: MessageFlags.Ephemeral
    });
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

      return interaction.update({
        content: `✅ Banned **${target.user.tag}** • Case #${modCase.caseId}`,
        components: []
      });
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

      return interaction.update({
        content: `✅ Kicked **${target.user.tag}** • Case #${modCase.caseId}`,
        components: []
      });
    }

    if (pending.type === 'remove-warning') {
      const removed = deleteWarningByCaseId(interaction.guild.id, pending.payload.caseId);

      if (!removed) {
        deletePendingAction(interaction.guild.id, token);
        return interaction.reply({
          content: '❌ Failed to remove warning.',
          flags: MessageFlags.Ephemeral
        });
      }

      updateCaseStatus(interaction.guild.id, pending.payload.caseId, 'reversed');

      const unwindCase = createCase({
        guildId: interaction.guild.id,
        userId: target.id,
        moderatorId: interaction.user.id,
        action: 'unwarn',
        reason: `Removed warning from case #${pending.payload.caseId}`,
        relatedCaseId: pending.payload.caseId,
        status: 'reversed'
      });

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Unwarn',
        reason: `Removed warning from case #${pending.payload.caseId}`,
        caseId: unwindCase.caseId
      });

      deletePendingAction(interaction.guild.id, token);

      await interaction.update({
        content: `🗑️ Removed warning linked to **Case #${pending.payload.caseId}**.`,
        components: []
      });

      await refreshPanelFromReply(interaction, target);
      return;
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
        components: []
      });

      await refreshPanelFromReply(interaction, target);
      return;
    }

    deletePendingAction(interaction.guild.id, token);

    return interaction.reply({
      content: '❌ Unknown pending action type.',
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('Pending action execution error:', err);
    deletePendingAction(interaction.guild.id, token);

    return interaction.reply({
      content: '❌ Failed to complete that action.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleModButton(interaction) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  if (!hasModPermission(interaction.member)) {
    return interaction.reply({
      content: '❌ No permission to use moderation panel.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_cancel_action') {
    return interaction.reply({
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
    return interaction.showModal(buildBulkModal('warn'));
  }

  if (interaction.customId === 'mod_bulk_timeout') {
    return interaction.showModal(buildBulkModal('timeout'));
  }

  if (interaction.customId === 'mod_bulk_kick') {
    return interaction.showModal(buildBulkModal('kick'));
  }

  if (interaction.customId === 'mod_bulk_ban') {
    return interaction.showModal(buildBulkModal('ban'));
  }

  if (interaction.customId.startsWith('mod_confirm_action:')) {
    const [, token] = interaction.customId.split(':');
    return executePendingAction(interaction, token);
  }

  if (interaction.customId.startsWith('mod_filter_cases:')) {
    const [, targetId, actionFilter, statusFilter, pageRaw] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, targetId);
    if (!target) {
      return interaction.reply({
        content: '❌ User not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const filters = {};
    if (actionFilter !== 'all') filters.action = actionFilter;
    if (statusFilter !== 'all') filters.status = statusFilter;

    const allCases = getFilteredCases(interaction.guild.id, target.id, filters);
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(allCases.length / perPage));
    const page = Math.max(0, Math.min(Number(pageRaw) || 0, totalPages - 1));
    const pageCases = allCases.slice(page * perPage, page * perPage + perPage);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📂 Filtered Cases for ${target.user.tag}`)
      .setDescription(
        pageCases.length
          ? pageCases.map(entry =>
              `**#${entry.caseId}** • ${entry.action}\nStatus: ${getStatusLabel(entry)}\nReason: ${entry.reason}\n<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>`
            ).join('\n\n')
          : 'No matching cases found.'
      )
      .setFooter({
        text: `Action: ${actionFilter} | Status: ${statusFilter} | Page ${page + 1} of ${totalPages}`
      })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      components: buildCaseFilterButtons(target.id),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_reverse_warning:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'warn') {
      return interaction.reply({
        content: '❌ That warning case could not be found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) {
      return interaction.reply({
        content: '❌ User not found for that case.',
        flags: MessageFlags.Ephemeral
      });
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-warning',
      payload: { caseId: modCase.caseId }
    });

    return interaction.reply({
      content: `Reverse warning from **Case #${modCase.caseId}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_reverse_timeout:')) {
    const [, caseIdRaw] = interaction.customId.split(':');
    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));

    if (!modCase || modCase.action !== 'timeout') {
      return interaction.reply({
        content: '❌ That timeout case could not be found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, modCase.userId);
    if (!target) {
      return interaction.reply({
        content: '❌ User not found for that case.',
        flags: MessageFlags.Ephemeral
      });
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'remove-timeout',
      payload: { sourceCaseId: modCase.caseId }
    });

    return interaction.reply({
      content: `Reverse timeout from **Case #${modCase.caseId}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_refresh:')) {
    const [, id] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, id);
    const payload = await buildPanelPayload(interaction, target);
    return interaction.update(payload);
  }

  if (interaction.customId.startsWith('mod_view_cases:')) {
    const [, targetId, pageRaw] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, targetId);
    if (!target) {
      return interaction.reply({
        content: '❌ User not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    const allCases = getCasesForUser(interaction.guild.id, target.id);
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(allCases.length / perPage));
    const page = Math.max(0, Math.min(Number(pageRaw) || 0, totalPages - 1));
    const pageCases = allCases.slice(page * perPage, page * perPage + perPage);

    const embed = buildCasesPageEmbed(target, pageCases, page, totalPages);

    return interaction.reply({
      embeds: [embed],
      components: [
        ...buildCasesPageButtons(target.id, page, totalPages),
        ...buildCaseFilterButtons(target.id)
      ],
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_case_detail:')) {
    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.showModal(
      buildCaseIdModal(`mod_submit_case_detail:${targetId}`, 'View Case Detail')
    );
  }

  if (interaction.customId.startsWith('mod_edit_case:')) {
    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.showModal(
      buildEditCaseModal(`mod_submit_edit_case:${targetId}`)
    );
  }

  if (interaction.customId.startsWith('mod_remove_warning:')) {
    const [, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
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
    const [, targetId] = interaction.customId.split(':');

    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: '❌ No permission to remove timeouts.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral
      });
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId,
      type: 'remove-timeout',
      payload: {}
    });

    return interaction.reply({
      content: `Remove timeout from **${target.user.tag}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_open_')) {
    const [prefix, targetId] = interaction.customId.split(':');

    if (!targetId || targetId === 'none') {
      return interaction.reply({
        content: '❌ No user selected.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral
      });
    }

    if (prefix === 'mod_open_ban') {
      return interaction.showModal(
        buildReasonModal(`mod_submit_ban:${targetId}`, 'Ban User', true, false)
      );
    }

    if (prefix === 'mod_open_kick') {
      return interaction.showModal(
        buildReasonModal(`mod_submit_kick:${targetId}`, 'Kick User')
      );
    }

    if (prefix === 'mod_open_warn') {
      return interaction.showModal(
        buildReasonModal(`mod_submit_warn:${targetId}`, 'Warn User', false, false, true)
      );
    }

    if (prefix === 'mod_open_timeout') {
      return interaction.showModal(
        buildReasonModal(`mod_submit_timeout:${targetId}`, 'Timeout User', false, true)
      );
    }
  }

  return false;
}

async function handleModModal(interaction) {
  await syncExpiredWarningsToCases(interaction.guild.id);

  if (!hasModPermission(interaction.member)) {
    return interaction.reply({
      content: '❌ No permission to use moderation panel.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_select_user_modal') {
    const query = interaction.fields.getTextInputValue('target_user_query').trim();
    const target = await findMemberByQuery(interaction.guild, query);

    if (!target) {
      return interaction.reply({
        content: '❌ User not found by that ID, username, tag, or display name.',
        flags: MessageFlags.Ephemeral
      });
    }

    const payload = await buildPanelPayload(interaction, target);

    return interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'mod_submit_bulk_warn') {
    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'warn',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_timeout') {
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
    const ids = interaction.fields.getTextInputValue('users').split(',');
    const reason = interaction.fields.getTextInputValue('reason');

    return runBulkAction(interaction, {
      actionType: 'kick',
      ids,
      reason
    });
  }

  if (interaction.customId === 'mod_submit_bulk_ban') {
    const ids = interaction.fields.getTextInputValue('users').split(',');
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const reason = interaction.fields.getTextInputValue('reason');

    if (!/^[0-7]$/.test(daysRaw)) {
      return interaction.reply({
        content: '❌ Delete message days must be 0-7.',
        flags: MessageFlags.Ephemeral
      });
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
      return interaction.reply({
        content: '❌ Case ID must be a number.',
        flags: MessageFlags.Ephemeral
      });
    }

    const modCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!modCase) {
      return interaction.reply({
        content: '❌ Case not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (targetId !== 'none' && modCase.userId !== targetId) {
      return interaction.reply({
        content: '❌ That case does not belong to the currently selected user.',
        flags: MessageFlags.Ephemeral
      });
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

    if (modCase.metadata && Object.keys(modCase.metadata).length) {
      embed.addFields({
        name: 'Metadata',
        value: `\`\`\`json\n${JSON.stringify(modCase.metadata, null, 2)}\n\`\`\``,
        inline: false
      });
    }

    return interaction.reply({
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
      return interaction.reply({
        content: '❌ Case ID must be a number.',
        flags: MessageFlags.Ephemeral
      });
    }

    const existingCase = getCaseById(interaction.guild.id, Number(caseIdRaw));
    if (!existingCase) {
      return interaction.reply({
        content: '❌ Case not found.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (targetId !== 'none' && existingCase.userId !== targetId) {
      return interaction.reply({
        content: '❌ That case does not belong to the currently selected user.',
        flags: MessageFlags.Ephemeral
      });
    }

    const updated = updateCaseReason(interaction.guild.id, Number(caseIdRaw), reason);
    if (!updated) {
      return interaction.reply({
        content: '❌ Failed to update case.',
        flags: MessageFlags.Ephemeral
      });
    }

    const target = await fetchTarget(interaction.guild, updated.userId);

    await interaction.reply({
      content: `✏️ Updated reason for **Case #${updated.caseId}**.`,
      flags: MessageFlags.Ephemeral
    });

    if (target) {
      await refreshPanelFromReply(interaction, target);
    }

    return true;
  }

  if (interaction.customId.startsWith('mod_submit_remove_warning:')) {
    const [, targetId] = interaction.customId.split(':');
    const caseIdRaw = interaction.fields.getTextInputValue('case_id').trim();

    if (!/^\d+$/.test(caseIdRaw)) {
      return interaction.reply({
        content: '❌ Warning case ID must be a number.',
        flags: MessageFlags.Ephemeral
      });
    }

    const warning = getWarningByCaseId(interaction.guild.id, Number(caseIdRaw));
    if (!warning) {
      return interaction.reply({
        content: '❌ Warning not found for that case ID.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (targetId !== 'none' && warning.userId !== targetId) {
      return interaction.reply({
        content: '❌ That warning does not belong to the currently selected user.',
        flags: MessageFlags.Ephemeral
      });
    }

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: warning.userId,
      type: 'remove-warning',
      payload: { caseId: Number(caseIdRaw) }
    });

    return interaction.reply({
      content: `Remove warning linked to **Case #${caseIdRaw}**?`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_ban:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral
      });
    }

    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();

    if (!/^[0-7]$/.test(daysRaw)) {
      return interaction.reply({
        content: '❌ Delete message days must be 0-7.',
        flags: MessageFlags.Ephemeral
      });
    }

    const deleteDays = Number(daysRaw);

    const token = createPendingAction(interaction.guild.id, {
      moderatorId: interaction.user.id,
      targetId: target.id,
      type: 'ban',
      payload: { reason, deleteDays }
    });

    return interaction.reply({
      content: `Confirm ban for **${target.user.tag}**?\nReason: ${reason}\nDelete days: ${deleteDays}`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_kick:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return interaction.reply({
        content: error,
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

    return interaction.reply({
      content: `Confirm kick for **${target.user.tag}**?\nReason: ${reason}`,
      components: buildConfirmRow(`mod_confirm_action:${token}`),
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId.startsWith('mod_submit_warn:')) {
    const [, targetId] = interaction.customId.split(':');
    const target = await fetchTarget(interaction.guild, targetId);
    const error = checkHierarchy(interaction, target);

    if (error) {
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral
      });
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const warnExpiryRaw = interaction.fields.getTextInputValue('warn_expiry') || 'never';
    const expiresAt = getWarningExpiry(warnExpiryRaw);

    if (warnExpiryRaw.trim().toLowerCase() !== 'never' && !expiresAt) {
      return interaction.reply({
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

      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Warn',
        reason,
        caseId: modCase.caseId,
        metadata: { expiresAt }
      });

      await interaction.reply({
        content: `⚠️ Warned **${target.user.tag}** • Case #${modCase.caseId}`,
        flags: MessageFlags.Ephemeral
      });

      await refreshPanelFromReply(interaction, target);
      return true;
    } catch (err) {
      console.error('Warn error:', err);
      return interaction.reply({
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
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral
      });
    }

    const durationRaw = interaction.fields.getTextInputValue('duration').trim();
    const reason = interaction.fields.getTextInputValue('reason').trim();
    const durationMs = parseDuration(durationRaw);

    if (!durationMs) {
      return interaction.reply({
        content: '❌ Invalid duration. Use `10m`, `1h`, or `1d`.',
        flags: MessageFlags.Ephemeral
      });
    }

    const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;
    if (durationMs > maxTimeoutMs) {
      return interaction.reply({
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

      return interaction.reply({
        content: `⏳ Timed out **${target.user.tag}** for **${durationRaw}** • Case #${modCase.caseId}`,
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      console.error('Timeout error:', err);
      return interaction.reply({
        content: '❌ Failed to timeout user.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  return false;
}

module.exports = {
  handleModButton,
  handleModModal
};