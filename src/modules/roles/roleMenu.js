'use strict';

// src/modules/roles/roleMenu.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const roleStore = require('./roleStore');

const PANEL_COLOR = 0x2f80ed;
const OK_COLOR = 0x57f287;
const WARN_COLOR = 0xfee75c;
const OFF_COLOR = 0xed4245;

function button(customId, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
  const builder = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) builder.setEmoji(emoji);

  return builder;
}

function formatDate(value) {
  if (!value) return 'Never';

  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Unknown';

  return `<t:${Math.floor(time / 1000)}:R>`;
}

function getHealth(section = {}) {
  const panelCount = Object.keys(section.reactionPanels || {}).length;
  const timedRoleCount = Object.keys(section.timedRoles || {}).length;
  const joinRoleCount = Object.keys(section.joinRoles || {}).length;
  const activePanels = Object.values(section.reactionPanels || {}).filter((panel) => panel.enabled !== false).length;
  const undeployedPanels = Object.values(section.reactionPanels || {}).filter((panel) => !panel.channelId || !panel.messageId).length;
  const activeTimedRoles = Object.values(section.timedRoles || {}).filter((rule) => rule.enabled !== false).length;

  let status = 'Excellent';
  let color = OK_COLOR;

  if (section.enabled === false) {
    status = 'Disabled';
    color = OFF_COLOR;
  } else if (undeployedPanels > 0) {
    status = 'Needs attention';
    color = WARN_COLOR;
  } else if (panelCount === 0 && timedRoleCount === 0 && joinRoleCount === 0) {
    status = 'Ready to configure';
    color = PANEL_COLOR;
  }

  return {
    status,
    color,
    panelCount,
    activePanels,
    undeployedPanels,
    timedRoleCount,
    activeTimedRoles,
    joinRoleCount,
  };
}

function buildBackRow() {
  return new ActionRowBuilder().addComponents(
    button('role_menu:home', 'Back', ButtonStyle.Secondary, '⬅️')
  );
}

function buildRoleMenuPayload(guildId) {
  const section = roleStore.getRolesSection(guildId);
  const health = getHealth(section);

  const embed = new EmbedBuilder()
    .setColor(health.color)
    .setTitle('🧩 Role System')
    .setDescription([
      '**Clean, safe role automation for this server.**',
      '',
      `> **Status:** ${section.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
      `> **Health:** ${health.status}`,
      `> **Reaction Panels:** ${health.activePanels}/${health.panelCount} active`,
      `> **Timed Roles:** ${health.activeTimedRoles}/${health.timedRoleCount} active`,
      `> **Join Roles:** ${health.joinRoleCount}`,
      `> **Updated:** ${formatDate(section.updatedAt)}`,
      '',
      'Use this as the central control point for reaction roles, timed roles and future dashboard wiring.',
    ].join('\n'))
    .addFields(
      {
        name: '📊 Analytics',
        value: [
          `Assigned: **${section.analytics?.assigned || 0}**`,
          `Removed: **${section.analytics?.removed || 0}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '⚙️ Safety',
        value: [
          `Self remove: **${section.settings?.allowSelfRemove !== false ? 'On' : 'Off'}**`,
          `Audit log: **${section.settings?.auditLog !== false ? 'On' : 'Off'}**`,
          `Timed checks: **${section.settings?.dailyTimedRoleCheck !== false ? 'On' : 'Off'}**`,
        ].join('\n'),
        inline: true,
      }
    )
    .setFooter({ text: 'Goliath Role System • Module Standard' })
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
  const undeployedCount = panels.filter((panel) => !panel.channelId || !panel.messageId).length;

  const lines = visiblePanels.length
    ? visiblePanels.map((panel, index) => {
        const roleCount = Array.isArray(panel.roles) ? panel.roles.length : 0;
        const location = panel.channelId && panel.messageId
          ? `<#${panel.channelId}> / \`${panel.messageId}\``
          : '⚠️ Not deployed';

        return [
          `**${index + 1}. ${panel.title || 'Reaction Roles'}**`,
          `Status: ${panel.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
          `Roles: **${roleCount}**`,
          `Location: ${location}`,
          `Updated: ${formatDate(panel.updatedAt)}`,
        ].join('\n');
      })
    : ['No reaction role panels have been created yet.'];

  const embed = new EmbedBuilder()
    .setColor(undeployedCount ? WARN_COLOR : PANEL_COLOR)
    .setTitle('🎛️ Reaction Role Panels')
    .setDescription(lines.join('\n\n'))
    .addFields({
      name: 'Summary',
      value: [
        `Panels: **${panels.length}**`,
        `Needs deployment: **${undeployedCount}**`,
      ].join('\n'),
      inline: true,
    })
    .setFooter({ text: 'Deploy/edit controls can be wired into Admin/Mod menu next.' })
    .setTimestamp(new Date());

  return {
    embeds: [embed],
    components: [buildBackRow()],
  };
}

function buildTimedRolesPayload(guildId) {
  const rules = roleStore.getTimedRoles(guildId);
  const visibleRules = rules.slice(0, 10);
  const activeRules = rules.filter((rule) => rule.enabled !== false);

  const lines = visibleRules.length
    ? visibleRules.map((rule, index) => [
        `**${index + 1}. ${rule.name || 'Timed Role'}**`,
        `Status: ${rule.enabled === false ? '🔴 Disabled' : '🟢 Enabled'}`,
        `Role: <@&${rule.roleId}>`,
        `After: **${rule.afterDays}** day${rule.afterDays === 1 ? '' : 's'}`,
        `Humans only: **${rule.onlyHumans !== false ? 'Yes' : 'No'}**`,
        `Last Run: ${formatDate(rule.lastRunAt)}`,
        `Last Assigned: **${rule.lastAssignedCount || 0}**`,
      ].join('\n'))
    : ['No timed role rules have been created yet.'];

  const embed = new EmbedBuilder()
    .setColor(activeRules.length ? OK_COLOR : PANEL_COLOR)
    .setTitle('⏳ Timed Member Roles')
    .setDescription(lines.join('\n\n'))
    .addFields({
      name: 'Summary',
      value: [
        `Rules: **${rules.length}**`,
        `Active: **${activeRules.length}**`,
      ].join('\n'),
      inline: true,
    })
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
  const health = getHealth(section);

  const embed = new EmbedBuilder()
    .setColor(health.color)
    .setTitle('⚙️ Role Settings')
    .setDescription([
      `**System Enabled:** ${section.enabled !== false ? 'Yes' : 'No'}`,
      `**Allow Self Remove:** ${settings.allowSelfRemove !== false ? 'Yes' : 'No'}`,
      `**Audit Log:** ${settings.auditLog !== false ? 'Yes' : 'No'}`,
      `**Daily Timed Role Check:** ${settings.dailyTimedRoleCheck !== false ? 'Yes' : 'No'}`,
      '',
      `**Created:** ${formatDate(section.createdAt)}`,
      `**Updated:** ${formatDate(section.updatedAt)}`,
      '',
      'Settings controls can be wired into your existing Admin/Mod menu next.',
    ].join('\n'))
    .setFooter({ text: 'Goliath Role System • Safe roles only' })
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
