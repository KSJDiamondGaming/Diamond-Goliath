'use strict';

// src/modules/tempvoice/tempVoiceMenu.js

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const tempVoiceManager = require('./tempVoiceManager');

function formatHub(hub) {
  const limit = hub.userLimit > 0 ? `${hub.userLimit} users` : 'No limit';
  const category = hub.categoryId ? `<#${hub.categoryId}>` : 'Same as hub channel';

  return [
    `**${hub.nameTemplate || '{username}\'s Channel'}**`,
    `Join Channel: <#${hub.joinChannelId}>`,
    `Category: ${category}`,
    `Limit: ${limit}`,
    `Status: ${hub.enabled === false ? 'Paused' : 'Active'}`,
  ].join('\n');
}

function buildTempVoiceEmbed(guildId) {
  const hubs = tempVoiceManager.getHubs(guildId);

  return new EmbedBuilder()
    .setColor('#2b7cff')
    .setTitle('Temp Voice Channels')
    .setDescription(
      hubs.length
        ? hubs.map(formatHub).join('\n\n')
        : 'No temp voice hubs are configured yet.'
    )
    .setFooter({ text: 'Goliath Temp Voice' })
    .setTimestamp(new Date());
}

function buildTempVoiceMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tempvoice:create')
        .setLabel('Create Hub')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('tempvoice:refresh')
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
  buildTempVoiceEmbed,
  buildTempVoiceMenuRows,
};
