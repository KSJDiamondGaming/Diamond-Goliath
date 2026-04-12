const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder
} = require('discord.js');

const db = require('../../utils/moderation/db');

function trimText(text, max = 1024) {
  if (!text) return 'No data';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('View moderation statistics for this server')
    .addIntegerOption(option =>
      option
        .setName('recent')
        .setDescription('How many recent cases to show')
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(15)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const recentLimit = interaction.options.getInteger('recent') || 5;

    const totalCasesRow = db.prepare(`
      SELECT COUNT(*) AS count
      FROM cases
      WHERE guild_id = ?
    `).get(guildId);

    const totalCases = totalCasesRow?.count || 0;

    if (!totalCases) {
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('❌ No Moderation Data')
        .setDescription('No moderation cases were found for this server.')
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
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
      SELECT case_id, action, user_id, created_at, reason, status
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

    const totalWarnCases = actionTotals.find(row => row.action === 'warn')?.count || 0;
    const clearedWarnings = Math.max(0, totalWarnCases - activeWarnings);

    const totalsText = actionTotals.length
      ? actionTotals.map(row => `**${row.action}**: ${row.count}`).join('\n')
      : 'No data';

    const topModeratorsText = topModerators.length
      ? topModerators
          .map((row, index) => `**${index + 1}.** <@${row.moderator_id}> — ${row.count}`)
          .join('\n')
      : 'No moderator data';

    const recentCasesText = recentCases.length
      ? recentCases
          .map(row => {
            const statusLabel =
              row.status === 'reversed'
                ? '🔁'
                : row.status === 'expired'
                  ? '⌛'
                  : '🟢';

            return `**#${row.case_id}** • ${row.action} • \`${row.user_id}\` ${statusLabel}\n<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>`;
          })
          .join('\n\n')
      : 'No recent cases';

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📊 Moderation Statistics')
      .setDescription(`Overview for **${interaction.guild.name}**`)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .addFields(
        {
          name: '📦 Total Cases',
          value: String(totalCases),
          inline: true,
        },
        {
          name: '⚠️ Active Warns',
          value: String(activeWarnings),
          inline: true,
        },
        {
          name: '🧹 Cleared/Expired Warns',
          value: String(clearedWarnings),
          inline: true,
        },
        {
          name: '📈 Action Totals',
          value: trimText(totalsText),
          inline: false,
        },
        {
          name: '🏆 Top Moderators',
          value: trimText(topModeratorsText),
          inline: false,
        },
        {
          name: `🕘 Recent ${recentLimit} Cases`,
          value: trimText(recentCasesText),
          inline: false,
        }
      )
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};