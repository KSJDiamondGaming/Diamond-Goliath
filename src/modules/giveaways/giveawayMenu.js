'use strict';

// src/modules/giveaways/giveawayMenu.js

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const giveawayStore = require('./giveawayStore');

function formatGiveaway(giveaway) {
  const endsAt = giveaway.endsAt
    ? `<t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`
    : 'No end time';

  return [
    `**${giveaway.prize}**`,
    `ID: \`${giveaway.giveawayId}\``,
    `Status: ${giveaway.status}`,
    `Entries: ${giveaway.entries?.length || 0}`,
    `Ends: ${endsAt}`,
  ].join('\n');
}

function buildGiveawayMenuEmbed(guildId) {
  const giveaways = giveawayStore.getGiveaways(guildId).slice(0, 10);

  return new EmbedBuilder()
    .setColor('#f59e0b')
    .setTitle('Giveaways')
    .setDescription(
      giveaways.length
        ? giveaways.map(formatGiveaway).join('\n\n')
        : 'No giveaways have been created yet.'
    )
    .setFooter({ text: 'Goliath Giveaways' })
    .setTimestamp(new Date());
}

function buildGiveawayMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway:create')
        .setLabel('Create Giveaway')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('giveaway:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

module.exports = {
  buildGiveawayMenuEmbed,
  buildGiveawayMenuRows,
};
