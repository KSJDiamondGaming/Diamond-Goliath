const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const { COLORS, EMOJIS } = require('../../utils/utility/uiConfig');

function buildCaseFilterButtons(
  targetId,
  actionFilter = 'all',
  statusFilter = 'all',
  page = 0
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:all:${statusFilter}:${page}`)
        .setLabel('📂 All')
        .setStyle(actionFilter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:warn:${statusFilter}:${page}`)
        .setLabel(`${EMOJIS.WARNING} Warns`)
        .setStyle(actionFilter === 'warn' ? ButtonStyle.Primary : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:timeout:${statusFilter}:${page}`)
        .setLabel(`${EMOJIS.TIMEOUT} Timeouts`)
        .setStyle(actionFilter === 'timeout' ? ButtonStyle.Primary : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:note:${statusFilter}:${page}`)
        .setLabel(`${EMOJIS.NOTE} Notes`)
        .setStyle(actionFilter === 'note' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:active:${page}`)
        .setLabel(`${EMOJIS.ACTIVE} Active`)
        .setStyle(statusFilter === 'active' ? ButtonStyle.Primary : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:reversed:${page}`)
        .setLabel(`${EMOJIS.REVERSED} Reversed`)
        .setStyle(statusFilter === 'reversed' ? ButtonStyle.Primary : ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`mod_filter_cases:${targetId}:${actionFilter}:expired:${page}`)
        .setLabel(`${EMOJIS.EXPIRED} Expired`)
        .setStyle(statusFilter === 'expired' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  ];
}

function buildCasesPageButtons(
  targetId,
  page,
  totalPages,
  actionFilter = 'all',
  statusFilter = 'all'
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page - 1}`)
        .setLabel(`${EMOJIS.BACK} Prev`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),

      new ButtonBuilder()
        .setCustomId(`mod_case_page:${targetId}:${actionFilter}:${statusFilter}:${page + 1}`)
        .setLabel(`Next ${EMOJIS.NEXT}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  ];
}

function buildCaseDetailButtons(modCase) {
  const isWarning = modCase.action === 'warn';
  const isTimeout = modCase.action === 'timeout';
  const reversedOrExpired =
    modCase.status === 'reversed' || modCase.status === 'expired';

  const hasNote = Boolean(modCase.note && String(modCase.note).trim());

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mod_case_reverse_warning:${modCase.caseId}`)
        .setLabel(`${EMOJIS.REVERSED} Reverse Warning`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isWarning || reversedOrExpired),

      new ButtonBuilder()
        .setCustomId(`mod_case_reverse_timeout:${modCase.caseId}`)
        .setLabel(`⏪ Reverse Timeout`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isTimeout || reversedOrExpired),

      new ButtonBuilder()
        .setCustomId(`mod_case_note:${modCase.caseId}`)
        .setLabel(hasNote ? `${EMOJIS.EDIT} Edit Note` : `${EMOJIS.NOTE} Add Note`)
        .setStyle(ButtonStyle.Primary)
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
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJIS.SETTINGS} ${EMOJIS.BULK} ${actionLabel} Progress`)
    .setDescription(`${EMOJIS.FIRE} Bulk moderation is currently running...`)
    .addFields(
      { name: '📦 Processed', value: `${processed}/${total}`, inline: true },
      { name: `${EMOJIS.SUCCESS} Success`, value: String(successCount), inline: true },
      { name: `${EMOJIS.ERROR} Failed`, value: String(failCount), inline: true }
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
    .setColor(failed.length ? COLORS.ERROR : COLORS.SUCCESS)
    .setTitle(
      failed.length
        ? `${EMOJIS.WARNING} ${EMOJIS.BULK} ${actionLabel} Complete`
        : `${EMOJIS.SUCCESS} ${EMOJIS.BULK} ${actionLabel} Complete`
    )
    .addFields(
      { name: '🎯 Total Targets', value: String(total), inline: true },
      { name: `${EMOJIS.SUCCESS} Successful`, value: String(success.length), inline: true },
      { name: `${EMOJIS.ERROR} Failed`, value: String(failed.length), inline: true },
      {
        name: `${EMOJIS.SUCCESS} Successes`,
        value: success.length ? success.join('\n').slice(0, 1024) : 'None',
        inline: false
      },
      {
        name: `${EMOJIS.ERROR} Failures`,
        value: failed.length ? failed.join('\n').slice(0, 1024) : 'None',
        inline: false
      }
    )
    .setTimestamp();
}

module.exports = {
  buildCaseFilterButtons,
  buildCasesPageButtons,
  buildCaseDetailButtons,
  getBulkActionProgressEmbed,
  getBulkActionSummaryEmbed
};