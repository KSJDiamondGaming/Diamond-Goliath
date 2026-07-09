const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { listTimeline } = require('./timelineManager');

function formatEvent(event) {
  const time = event.createdAt
    ? `<t:${Math.floor(new Date(event.createdAt).getTime() / 1000)}:R>`
    : 'Unknown time';

  const actor = event.actorTag ? ` by ${event.actorTag}` : '';
  const description = event.description ? `\n${event.description}` : '';

  return `**${event.title}**${actor}\n${time}${description}`;
}

function buildTimelineEmbed(guildId, client, options = {}) {
  const events = listTimeline(guildId, { limit: options.limit || 10 }, client);

  const embed = new EmbedBuilder()
    .setColor('#2b7cff')
    .setTitle('Goliath Timeline')
    .setDescription(
      events.length
        ? events.map(formatEvent).join('\n\n')
        : 'No timeline events recorded yet.'
    )
    .setFooter({ text: 'Recent server activity' })
    .setTimestamp(new Date());

  return embed;
}

function buildTimelineMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('timeline:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('timeline:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

module.exports = {
  buildTimelineEmbed,
  buildTimelineMenuRows,
};
