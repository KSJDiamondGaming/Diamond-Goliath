'use strict';

// src/modules/autoRoles/autoRoleMenu.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const autoRoleStore = require('./autoRoleStore');

function roleList(roleIds = []) {
  return roleIds.length
    ? roleIds.map((id) => `<@&${id}>`).join(', ')
    : 'None configured';
}

function statusText(section) {
  return section.enabled === false ? 'Disabled' : 'Enabled';
}

function statusColor(section) {
  return section.enabled === false ? '#ed4245' : '#57f287';
}

function buildAutoRolesEmbed(guildId) {
  const section = autoRoleStore.getAutoRolesSection(guildId);

  return new EmbedBuilder()
    .setColor(statusColor(section))
    .setTitle('🎭 Auto Roles')
    .setDescription([
      `Status: **${statusText(section)}**`,
      '',
      `Member Join Roles: ${roleList(section.joinRoles)}`,
      `Bot Join Roles: ${roleList(section.botRoles)}`,
      '',
      `Apply To Bots: **${section.settings?.applyToBots === true ? 'Yes' : 'No'}**`,
      '',
      '**Analytics**',
      `Assigned: **${section.analytics?.assigned || 0}**`,
      `Failed: **${section.analytics?.failed || 0}**`,
    ].join('\n'))
    .setFooter({ text: 'Goliath Auto Roles' })
    .setTimestamp(new Date());
}

function buildAutoRolesMenuRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('autoRoles:toggle')
        .setLabel('Enable / Disable')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('autoRoles:add')
        .setLabel('Add Roles')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('autoRoles:configure')
        .setLabel('Configure')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('autoRoles:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('admin:back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

module.exports = {
  buildAutoRolesEmbed,
  buildAutoRolesMenuRows,
};
