const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const stickyStore = require('./stickyGuildStore');

function buildStickyStatusEmbed(guildId, channelId, client) {
  const sticky = stickyStore.getChannelSticky(guildId, channelId, client);

  if (!sticky) {
    return new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle('Sticky Messages')
      .setDescription('No sticky message is configured for this channel. Use **Set Sticky** to create one.')
      .setFooter({ text: 'Sticky messages repost at the bottom of the channel after normal chat activity.' });
  }

  return new EmbedBuilder()
    .setColor(sticky.enabled ? '#22c55e' : '#ef4444')
    .setTitle('Sticky Messages')
    .setDescription(sticky.enabled ? 'Sticky message is active.' : 'Sticky message is paused.')
    .addFields(
      { name: 'Type', value: sticky.type || 'text', inline: true },
      { name: 'Repost Every', value: `${sticky.repostEvery ?? 10} messages`, inline: true },
      { name: 'Cooldown', value: `${sticky.cooldownSeconds ?? 60}s`, inline: true },
      { name: 'Content', value: String(sticky.content || 'No content set.').slice(0, 1000), inline: false },
      { name: 'Last Message ID', value: sticky.lastMessageId || 'Not posted yet', inline: false }
    )
    .setTimestamp(new Date(sticky.updatedAt || Date.now()));
}

function buildStickyMenuRows(channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sticky:setup:${channelId}`)
        .setLabel('Set Sticky')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`sticky:repost:${channelId}`)
        .setLabel('Repost Now')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`sticky:pause:${channelId}`)
        .setLabel('Pause')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`sticky:resume:${channelId}`)
        .setLabel('Resume')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`sticky:delete:${channelId}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('admin:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

module.exports = {
  buildStickyStatusEmbed,
  buildStickyMenuRows,
};
