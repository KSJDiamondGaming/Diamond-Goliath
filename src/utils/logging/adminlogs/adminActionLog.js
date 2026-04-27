const { EmbedBuilder } = require('discord.js');
const {
  getLogChannelId,
  isLogEventEnabled,
} = require('../../../dashboard/server/utils/guildManager');

async function logAdminAction({
  guild,
  action,
  moderator = null,
  reason = 'No reason provided',
  color = '#5865F2',
  details = [],
  title = null,
}) {
  if (!guild) return;

  if (!isLogEventEnabled(guild.id, 'adminActions')) return;

  const logChannelId = getLogChannelId(guild.id, 'admin');
  if (!logChannelId) return;

  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const fields = [
      {
        name: 'Action',
        value: action || 'Unknown',
      },
      {
        name: 'Moderator',
        value: moderator ? `${moderator.tag} (${moderator.id})` : 'System',
      },
      {
        name: 'Reason',
        value: reason,
      },
    ];

    for (const detail of details || []) {
      if (!detail?.name || detail?.value == null) continue;

      fields.push({
        name: detail.name,
        value: String(detail.value),
        inline: detail.inline ?? false,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || '👑 Admin Action Logged')
      .addFields(fields)
      .setTimestamp();

    if (moderator?.displayAvatarURL) {
      embed.setThumbnail(moderator.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`❌ Admin log failed (${guild.id}):`, error);
  }
}

module.exports = logAdminAction;