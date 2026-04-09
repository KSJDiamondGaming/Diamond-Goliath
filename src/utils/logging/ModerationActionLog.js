const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../guildConfigStore');

async function logModerationAction({
  guild,
  action,
  user = null,
  moderator = null,
  reason = 'No reason provided',
  duration = null,
  color = '#5865F2',
  caseId = null,
  details = [],
  title = null
}) {
  if (!guild) return;

  const config = getGuildConfig(guild.id);
  const logChannelId = config.modLogChannelId;

  if (!logChannelId) return;

  try {
    const channel = await guild.channels.fetch(logChannelId);
    if (!channel || !channel.isTextBased()) return;

    const fields = [];

    if (user) {
      fields.push({
        name: 'User',
        value: `${user.tag} (${user.id})`,
        inline: false
      });
    }

    fields.push({
      name: 'Moderator',
      value: moderator ? `${moderator.tag} (${moderator.id})` : 'System',
      inline: false
    });

    if (reason) {
      fields.push({
        name: 'Reason',
        value: reason,
        inline: false
      });
    }

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

    if (Array.isArray(details) && details.length) {
      for (const detail of details) {
        if (!detail?.name || !detail?.value) continue;

        fields.push({
          name: detail.name,
          value: String(detail.value),
          inline: detail.inline ?? false
        });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || `🛡️ Moderation Action: ${action}`)
      .addFields(fields)
      .setTimestamp();

    if (user && typeof user.displayAvatarURL === 'function') {
      embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
    } else if (moderator && typeof moderator.displayAvatarURL === 'function') {
      embed.setThumbnail(moderator.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`Failed to log moderation action in guild ${guild.id}:`, error);
  }
}

module.exports = logModerationAction;