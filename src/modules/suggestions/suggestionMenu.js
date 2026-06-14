const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const suggestionManager = require('./suggestionManager');

function buildSuggestionButtons(suggestionId, includeStaffButtons = false) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion:up:${suggestionId}`)
        .setLabel('Upvote')
        .setEmoji('👍')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`suggestion:down:${suggestionId}`)
        .setLabel('Downvote')
        .setEmoji('👎')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];

  if (includeStaffButtons) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`suggestion:accept:${suggestionId}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`suggestion:deny:${suggestionId}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`suggestion:implemented:${suggestionId}`)
          .setLabel('Implemented')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`suggestion:archive:${suggestionId}`)
          .setLabel('Archive')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return rows;
}

function buildSuggestionListEmbed(guildId, client, options = {}) {
  const suggestions = suggestionManager.getRecentSuggestions(guildId, options, client);

  return new EmbedBuilder()
    .setColor('#2b7cff')
    .setTitle('Suggestions')
    .setDescription(
      suggestions.length
        ? suggestions.map(formatSuggestionLine).join('\n')
        : 'No suggestions have been submitted yet.'
    )
    .setFooter({ text: 'Goliath Suggestions' })
    .setTimestamp();
}

function formatSuggestionLine(suggestion) {
  const upvotes = suggestion.upvotes?.length || 0;
  const downvotes = suggestion.downvotes?.length || 0;
  const content = String(suggestion.content || 'No content').slice(0, 80);

  return `**#${suggestion.id}** [${suggestion.status}] 👍 ${upvotes} 👎 ${downvotes}\n${content}`;
}

function buildSuggestionMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('suggestions:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('suggestions:pending')
        .setLabel('Pending')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('suggestions:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

module.exports = {
  buildSuggestionButtons,
  buildSuggestionListEmbed,
  buildSuggestionMenuRows,
};
