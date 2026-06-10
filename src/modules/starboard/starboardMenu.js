'use strict';

// src/modules/starboard/starboardMenu.js

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const starboardStore = require('./starboardStore');

function buildStarboardEmbed(guildId) {
  const section = starboardStore.getStarboardSection(guildId);
  const postCount = Object.keys(section.posts || {}).length;

  return new EmbedBuilder()
    .setColor('#facc15')
    .setTitle('Starboard')
    .setDescription([
      `Status: **${section.enabled === false ? 'Disabled' : 'Enabled'}**`,
      `Channel: ${section.channelId ? `<#${section.channelId}>` : 'Not set'}`,
      `Emoji: ${section.emoji || '⭐'}`,
      `Threshold: ${section.threshold || 3}`,
      `Saved Posts: ${postCount}`,
    ].join('\n'))
    .setFooter({ text: 'Goliath Starboard' })
    .setTimestamp(new Date());
}

function buildStarboardMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('starboard:configure')
        .setLabel('Configure')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('starboard:refresh')
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
  buildStarboardEmbed,
  buildStarboardMenuRows,
};
