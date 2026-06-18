'use strict';

// src/modules/verification/verificationMenu.js

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const verificationStore = require('./verificationStore');

function formatRole(roleId) {
  return roleId ? `<@&${roleId}>` : 'Not configured';
}

function buildVerificationMenuEmbed(guildId) {
  const section = verificationStore.getVerificationSection(guildId);
  const panelCount = Object.keys(section.panels || {}).length;

  return new EmbedBuilder()
    .setColor(section.enabled === true ? '#57f287' : '#ed4245')
    .setTitle('Verification')
    .setDescription([
      `Status: **${section.enabled === true ? 'Enabled' : 'Disabled'}**`,
      `Verified Role: ${formatRole(section.settings?.verifiedRoleId)}`,
      `Unverified Role: ${formatRole(section.settings?.unverifiedRoleId)}`,
      `Panels: **${panelCount}**`,
      '',
      `Verified: **${section.analytics?.verified || 0}**`,
      `Failed: **${section.analytics?.failed || 0}**`,
    ].join('\n'))
    .setFooter({ text: 'Goliath Verification' })
    .setTimestamp(new Date());
}

function buildVerificationMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verification:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('verification:configure')
        .setLabel('Configure')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('admin:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

module.exports = {
  buildVerificationMenuEmbed,
  buildVerificationMenuRows,
};
