'use strict';

// src/modules/roles/roleMenu.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const roleStore = require('./roleStore');

function button(customId, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
  const builder = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) builder.setEmoji(emoji);

  return builder;
}

function buildBackRow() {
  return new ActionRowBuilder().addComponents(
    button('role_menu:home', 'Back', ButtonStyle.Secondary, '⬅️')
  );
}

function buildRoleMenuPayload(guildId) {
  const section = roleStore.getRolesSection(guildId);
  const panelCount = Object.keys(section.reactionPanels || {}).length;
  const timedRoleCount = Object.keys(section.timedRoles || {}).length;
  const joinRoleCount = Object.keys(section.joinRoles || {}).length;

  const embed = new EmbedBuilder()
    .setColor(section.enabled === false ? 0xed4245 : 0x2f80ed)
    .setTitle('🧩 Role System')
    .setDescription([
      'Manage Goliath role automation from one clean place.',
      '',
      `**Status:** ${section.enabled === false ? 'Disabled' : 'Enabled'}`,
      `**Reaction Panels:** ${panelCount}`,
      `**Timed Roles:** ${timedRoleCount}`,
      `**Join Roles:** ${joinRoleCount}`,
      '',
      'Built to plug into Admin, Mod Menu, Embed Studio and Dashboard later.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Role System' })
    .setTimestamp(new Date());

  const rowOne = new ActionRowBuilder().addComponents(
    button('role_menu:panels', 'Reaction Panels', ButtonStyle.Primary, '🎛️'),
    button('role_menu:timed', 'Timed Roles', ButtonStyle.Primary, '⏳'),
    button('role_menu:settings', 'Settings', ButtonStyle.Secondary, '⚙️')
  );

  return {
    embeds: [embed],
    components: [rowOne],
  };
}

function buildPanelsPayload(guildId) {
  const panels = roleStore.getReactionPanels(guildId);
  const visiblePanels = panels.slice(0, 10);

  const lines = visiblePanels.length
    ? visiblePanels.map((panel, index) => {
        const roleCount = Array.isArray(panel.roles) ? panel.roles.length : 0;
        const location = panel.channelId && panel.messageId
          ? `<#${panel.channelId}> / \`${panel.messageId}\``
          : 'Not deployed';

        return [
          `**${index + 1}. ${panel.title || 'Reaction Roles'}**`,
          `Status: ${panel.enabled === false ? 'Disabled' : 'Enabled'}`,
          `Roles: ${roleCount}`,
          `Location: ${location}`,
        ].join('\n');
      })
    : ['No reaction role panels have been created yet.'];

  const embed = new EmbedBuilder()
    .setColor(0x2f80ed)
    .setTitle('🎛️ Reaction Role Panels')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Panel creation/edit buttons can be added to the existing Admin/Mod menu next.' })
    .setTimestamp(new Date());

  return {
    embeds: [embed],
    components: [buildBackRow()],
  };
}

function buildTimedRolesPayload(guildId) {
  const rules = roleStore.getTimedRoles(guildId);
  const visibleRules = rules.slice(0, 10);

  const lines = visibleRules.length
    ? visibleRules.map((rule, index) => [
        `**${index + 1}. ${rule.name || 'Timed Role'}**`,
        `Status: ${rule.enabled === false ? 'Disabled' : 'Enabled'}`,
        `Role: <@&${rule.roleId}>`,
        `After: ${rule.afterDays} day${rule.afterDays === 1 ? '' : 's'}`,
        `Last Run: ${rule.lastRunAt || 'Never'}`,
        `Last Assigned: ${rule.lastAssignedCount || 0}`,
      ].join('\n'))
    : ['No timed role rules have been created yet.'];

  const embed = new EmbedBuilder()
    .setColor(0x2f80ed)
    .setTitle('⏳ Timed Member Roles')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Example: assign Veteran after 180 days in the server.' })
    .setTimestamp(new Date());

  return {
    embeds: [embed],
    components: [buildBackRow()],
  };
}

function buildSettingsPayload(guildId) {
  const section = roleStore.getRolesSection(guildId);
  const settings = section.settings || {};

  const embed = new EmbedBuilder()
    .setColor(0x2f80ed)
    .setTitle('⚙️ Role Settings')
    .setDescription([
      `**System Enabled:** ${section.enabled !== false ? 'Yes' : 'No'}`,
      `**Allow Self Remove:** ${settings.allowSelfRemove !== false ? 'Yes' : 'No'}`,
      `**Audit Log:** ${settings.auditLog !== false ? 'Yes' : 'No'}`,
      `**Daily Timed Role Check:** ${settings.dailyTimedRoleCheck !== false ? 'Yes' : 'No'}`,
      '',
      'Settings controls can be wired into your existing Admin/Mod menu next.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Role System' })
    .setTimestamp(new Date());

  return {
    embeds: [embed],
    components: [buildBackRow()],
  };
}

module.exports = {
  buildRoleMenuPayload,
  buildPanelsPayload,
  buildTimedRolesPayload,
  buildSettingsPayload,
};
