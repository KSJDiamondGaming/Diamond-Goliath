const { EmbedBuilder } = require('discord.js');
const { truncate, formatDuration } = require('./automodHelpers');

async function logAutomodEvent({
  guild,
  message,
  result,
  actionTaken,
}) {
  try {
    if (!guild || !message || !result) return;

    const channelId = message.channel?.id;
    const config = result.configSnapshot || {};
    const logsEnabled = config.logs?.enabled !== false;
    const logsChannelId = config.logs?.channelId;

    if (!logsEnabled || !logsChannelId) return;

    const logChannel = guild.channels.cache.get(logsChannelId);
    if (!logChannel) return;

    const fields = [
      {
        name: 'Rule',
        value: result.ruleName || 'Unknown',
        inline: true,
      },
      {
        name: 'Action',
        value: actionTaken || 'None',
        inline: true,
      },
      {
        name: 'User',
        value: `${message.author.tag}\n\`${message.author.id}\``,
        inline: true,
      },
      {
        name: 'Channel',
        value: channelId ? `<#${channelId}>` : 'Unknown',
        inline: true,
      },
      {
        name: 'Reason',
        value: truncate(result.reason || 'No reason provided', 1024),
        inline: false,
      },
    ];

    if (result.timeoutMs) {
      fields.push({
        name: 'Timeout Length',
        value: formatDuration(result.timeoutMs),
        inline: true,
      });
    }

    if (message.content?.trim()) {
      fields.push({
        name: 'Message Content',
        value: truncate(message.content, 1024),
        inline: false,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff9500)
      .setTitle('🛡️ AutoMod Triggered')
      .addFields(fields)
      .setTimestamp()
      .setFooter({
        text: `Guild: ${guild.name}`,
      });

    if (message.author?.displayAvatarURL) {
      embed.setThumbnail(message.author.displayAvatarURL({ forceStatic: false }));
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[AUTOMOD] Failed to send automod log:', error);
  }
}

module.exports = {
  logAutomodEvent,
};