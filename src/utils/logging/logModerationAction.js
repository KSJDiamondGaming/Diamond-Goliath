const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../guildConfigStore');

async function logModerationAction({
  guild,
  action,
  user,
  moderator = null,
  reason = 'No reason provided',
  duration = null,
  color = '#5865F2',
  caseId = null
}) {
  if (!guild || !user) return;

  const config = getGuildConfig(guild.id);
  const logChannelId = config.modLogChannelId;

  if (!logChannelId) return;

  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const fields = [
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
    ];

    if (duration) {
      fields.push({
        name: 'Duration',
        value: duration,
        inline: false
      });
    }

    if (caseId) {
      fields.push({
        name: 'Case ID',
        value: `#${caseId}`,
        inline: false
      });
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🛡️ Moderation Action: ${action}`)
      .addFields(fields)
      .setTimestamp();

    if (typeof user.displayAvatarURL === 'function') {
      embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log moderation action in guild ${guild.id}:`, error);
  }
}

module.exports = logModerationAction;