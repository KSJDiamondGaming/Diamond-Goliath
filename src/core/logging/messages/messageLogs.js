const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../guild/guildManager');

function trim(text, max = 1024) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatUser(user) {
  if (!user) return 'Unknown User';
  return `${user} \`${user.tag || user.username || user.id}\``;
}

async function getLogChannel(guild) {
  const channelId = guildManager.getLogChannelId(guild.id, 'general');
  if (!channelId) return null;

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));

  return channel?.isTextBased() ? channel : null;
}

/* ---------------- DELETE ---------------- */

async function handleMessageDelete(message) {
  try {
    if (!message.guild) return;
    if (message.author?.bot) return;

    const guild = message.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'messageDelete')) return;

    const channel = await getLogChannel(guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('💬 Message Deleted')
      .addFields(
        { name: 'User', value: formatUser(message.author), inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Message ID', value: `\`${message.id}\``, inline: true }
      )
      .setTimestamp();

    embed.setDescription(
      message.content
        ? trim(message.content, 4096)
        : '*No text content available.*'
    );

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[messageLog] delete error:', err);
  }
}

/* ---------------- UPDATE ---------------- */

async function handleMessageUpdate(oldMessage, newMessage) {
  try {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;

    const guild = newMessage.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'messageEdit')) return;

    const oldContent = oldMessage.content || '';
    const newContent = newMessage.content || '';

    if (!oldContent && !newContent) return;
    if (oldContent === newContent) return;

    const channel = await getLogChannel(guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'User', value: formatUser(newMessage.author), inline: true },
        { name: 'Channel', value: `${newMessage.channel}`, inline: true },
        { name: 'Message ID', value: `\`${newMessage.id}\``, inline: true },
        {
          name: 'Before',
          value: trim(oldContent || '*No content*'),
        },
        {
          name: 'After',
          value: trim(newContent || '*No content*'),
        }
      )
      .setTimestamp();

    if (newMessage.url) {
      embed.setDescription(`[Jump to message](${newMessage.url})`);
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[messageLog] update error:', err);
  }
}

module.exports = {
  handleMessageDelete,
  handleMessageUpdate,
};
