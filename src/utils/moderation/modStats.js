const { EmbedBuilder } = require('discord.js');
const db = require('./db');

function trimText(text, max = 1024) {
  if (!text) return 'No data';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
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

  const totalWarnCases = actionTotals.find(r => r.action === 'warn')?.count || 0;
  const clearedWarnings = Math.max(0, totalWarnCases - activeWarnings);

  const totalsText = actionTotals.map(r => `**${r.action}**: ${r.count}`).join('\n') || 'No data';

  const topModsText = topModerators.map((r, i) =>
    `**${i + 1}.** <@${r.moderator_id}> — ${r.count}`
  ).join('\n') || 'No data';

  const recentText = recentCases.map(r => {
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
      { name: `🕘 Recent Cases`, value: trimText(recentText) }
    )
    .setTimestamp();
}

module.exports = { buildModStatsEmbed };