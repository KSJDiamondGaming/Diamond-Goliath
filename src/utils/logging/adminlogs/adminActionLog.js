const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../../config/guildConfigStore');

async function logAdminAction({
  guild,
  action,
  moderator = null,
  reason = 'No reason provided',
  color = '#5865F2',
  details = [],
  title = null,
  force = false,
}) {
  if (!guild) return;

  const config = getGuildConfig(guild.id);

  if (!force && config.adminActionLoggerEnabled !== true) {
    return;
  }

  const logChannelId =
    config.adminLogChannelId ||
    config.logsChannelId ||
    null;

  if (!logChannelId) return;

  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const fields = [
      {
        name: 'Action',
        value: action || 'Unknown',
        inline: false,
      },
      {
        name: 'Moderator',
        value: moderator ? `${moderator.tag} (${moderator.id})` : 'System',
        inline: false,
      },
      {
        name: 'Reason',
        value: reason || 'No reason provided',
        inline: false,
      },
    ];

    if (Array.isArray(details) && details.length) {
      for (const detail of details) {
        if (!detail?.name || detail?.value == null) continue;

        fields.push({
          name: detail.name,
          value: String(detail.value),
          inline: detail.inline ?? false,
        });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || '👑 Admin Action Logged')
      .addFields(fields)
      .setTimestamp();

    if (moderator && typeof moderator.displayAvatarURL === 'function') {
      embed.setThumbnail(moderator.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log admin action in guild ${guild.id}:`, error);
  }
}

module.exports = logAdminAction;