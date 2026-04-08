const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../guildConfigStore');

async function logModerationAction({
  guild,
  action,
  user,
  moderator = null,
  reason = 'No reason provided',
  duration = null,
  color = '#5865F2'
}) {
  if (!guild || !user) return;

  const config = getGuildConfig(guild.id);
  const logChannelId = config.modLogChannelId;

  if (!logChannelId) return;

  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🛡️ Moderation Action: ${action}`)
      .addFields(
        {
          name: 'User',
          value: `${user.tag} (${user.id})`,
          inline: false
        },
        {
          name: 'Moderator',
          value: moderator ? `${moderator.tag} (${moderator.id})` : 'System',
          inline: false
        },
        {
          name: 'Reason',
          value: reason,
          inline: false
        }
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({
        name: 'Duration',
        value: duration,
        inline: false
      });
    }

    if (typeof user.displayAvatarURL === 'function') {
      embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log moderation action in guild ${guild.id}:`, error);
  }
}

module.exports = logModerationAction;