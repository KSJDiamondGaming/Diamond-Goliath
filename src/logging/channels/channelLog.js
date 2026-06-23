const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');

async function getLogChannel(guild) {
  const id =
    guildManager.getLogChannelId(guild.id, 'general') ||
    guildManager.getLogChannelId(guild.id, 'admin');

  if (!id) return null;

  const channel =
    guild.channels.cache.get(id) ||
    (await guild.channels.fetch(id).catch(() => null));

  return channel?.isTextBased() ? channel : null;
}

async function handleChannelCreate(channel) {
  try {
    const guild = channel.guild;
    if (!guild) return;
    if (!guildManager.isLogEventEnabled(guild.id, 'channelCreate')) return;

    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🏗️ Channel Created')
      .addFields(
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Name', value: `\`${channel.name}\``, inline: true },
        { name: 'Channel ID', value: `\`${channel.id}\``, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[channelLog] create error:', error);
  }
}

async function handleChannelDelete(channel) {
  try {
    const guild = channel.guild;
    if (!guild) return;
    if (!guildManager.isLogEventEnabled(guild.id, 'channelDelete')) return;

    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('🗑️ Channel Deleted')
      .addFields(
        { name: 'Name', value: `\`${channel.name || 'Unknown'}\``, inline: true },
        { name: 'Channel ID', value: `\`${channel.id}\``, inline: true },
        { name: 'Type', value: `\`${channel.type}\``, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[channelLog] delete error:', error);
  }
}

async function handleChannelUpdate(oldChannel, newChannel) {
  try {
    const guild = newChannel.guild;
    if (!guild) return;
    if (!guildManager.isLogEventEnabled(guild.id, 'channelUpdate')) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push(`Name: \`${oldChannel.name}\` → \`${newChannel.name}\``);
    }

    if (oldChannel.topic !== newChannel.topic) {
      changes.push('Topic changed');
    }

    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push(`NSFW: \`${oldChannel.nsfw ? 'Yes' : 'No'}\` → \`${newChannel.nsfw ? 'Yes' : 'No'}\``);
    }

    if (!changes.length) return;

    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('✏️ Channel Updated')
      .addFields(
        { name: 'Channel', value: `${newChannel}`, inline: true },
        { name: 'Channel ID', value: `\`${newChannel.id}\``, inline: true },
        { name: 'Changes', value: changes.join('\n'), inline: false }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[channelLog] update error:', error);
  }
}

module.exports = {
  handleChannelCreate,
  handleChannelDelete,
  handleChannelUpdate,
};
