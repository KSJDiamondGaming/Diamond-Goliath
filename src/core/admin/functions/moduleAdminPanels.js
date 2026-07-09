'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');

const PANEL_COLOR = '#5865F2';

const MODULE_PANEL_REGISTRY = {
  sticky: {
    route: 'admin:sticky',
    key: 'sticky',
    title: '📌 Sticky Notes',
    summary: 'Persistent channel notes and reminders.',
    status: 'Configure channels, manager roles, cleanup behaviour and message mode.',
    defaults: {
      enabled: true,
      channels: [],
      managerRoleIds: [],
      mode: 'per-channel',
      cleanupPrevious: true,
      allowEmbeds: true,
    },
    fields: [
      ['Mode', (c) => c.mode || 'per-channel'],
      ['Channels', (c) => formatChannels(c.channels)],
      ['Manager Roles', (c) => formatRoles(c.managerRoleIds)],
      ['Cleanup Previous', (c) => yesNo(c.cleanupPrevious !== false)],
      ['Allow Embeds', (c) => yesNo(c.allowEmbeds !== false)],
    ],
    selectMenus: ['channels', 'managerRoles'],
    optionMenus: [
      {
        id: 'mode',
        placeholder: 'Sticky mode',
        options: [
          ['per-channel', 'Per Channel', 'One sticky note per selected channel'],
          ['manual', 'Manual', 'Only staff-triggered sticky notes'],
        ],
      },
    ],
    toggles: [
      ['cleanupPrevious', '🧹 Cleanup Previous'],
      ['allowEmbeds', '🎨 Allow Embeds'],
    ],
  },
  suggestions: {
    route: 'admin:suggestions',
    key: 'suggestions',
    title: '💡 Suggestions',
    summary: 'Suggestion intake, voting, review and approval workflow.',
    status: 'Configure submit/review channels, voting behaviour and reviewer roles.',
    defaults: {
      enabled: true,
      submitChannelId: null,
      reviewChannelId: null,
      approvedChannelId: null,
      deniedChannelId: null,
      reviewerRoleIds: [],
      anonymous: false,
      voting: true,
      requireReview: true,
    },
    fields: [
      ['Submit Channel', (c) => formatChannel(c.submitChannelId)],
      ['Review Channel', (c) => formatChannel(c.reviewChannelId)],
      ['Approved Channel', (c) => formatChannel(c.approvedChannelId)],
      ['Denied Channel', (c) => formatChannel(c.deniedChannelId)],
      ['Reviewer Roles', (c) => formatRoles(c.reviewerRoleIds)],
      ['Voting', (c) => yesNo(c.voting !== false)],
      ['Require Review', (c) => yesNo(c.requireReview !== false)],
      ['Anonymous', (c) => yesNo(c.anonymous === true)],
    ],
    selectMenus: ['submitChannel', 'reviewChannel', 'approvedChannel', 'deniedChannel', 'reviewerRoles'],
    toggles: [
      ['voting', '🗳️ Voting'],
      ['requireReview', '🔎 Require Review'],
      ['anonymous', '👤 Anonymous'],
    ],
  },
  giveaways: {
    route: 'admin:giveaways',
    key: 'giveaways',
    title: '🎉 Giveaways',
    summary: 'Giveaway creation, entries, winners and rerolls.',
    status: 'Configure announcement/log channels, manager roles and entry behaviour.',
    defaults: {
      enabled: true,
      announcementChannelId: null,
      logChannelId: null,
      managerRoleIds: [],
      allowMultipleEntries: false,
      requireRole: false,
      pingWinners: true,
    },
    fields: [
      ['Announcement Channel', (c) => formatChannel(c.announcementChannelId)],
      ['Log Channel', (c) => formatChannel(c.logChannelId)],
      ['Manager Roles', (c) => formatRoles(c.managerRoleIds)],
      ['Multiple Entries', (c) => yesNo(c.allowMultipleEntries === true)],
      ['Require Role', (c) => yesNo(c.requireRole === true)],
      ['Ping Winners', (c) => yesNo(c.pingWinners !== false)],
    ],
    selectMenus: ['announcementChannel', 'logChannel', 'managerRoles'],
    toggles: [
      ['allowMultipleEntries', '🎟️ Multiple Entries'],
      ['requireRole', '🔒 Require Role'],
      ['pingWinners', '📣 Ping Winners'],
    ],
  },
  fun: {
    route: 'admin:fun',
    key: 'fun',
    title: '🎮 Fun',
    summary: 'Fun commands and optional community extras.',
    status: 'Configure allowed channels, blocked channels, manager roles and safety options.',
    defaults: {
      enabled: true,
      allowedChannelIds: [],
      blockedChannelIds: [],
      managerRoleIds: [],
      allowImages: true,
      allowGames: true,
      familyFriendly: true,
    },
    fields: [
      ['Allowed Channels', (c) => formatChannels(c.allowedChannelIds)],
      ['Blocked Channels', (c) => formatChannels(c.blockedChannelIds)],
      ['Manager Roles', (c) => formatRoles(c.managerRoleIds)],
      ['Images', (c) => yesNo(c.allowImages !== false)],
      ['Games', (c) => yesNo(c.allowGames !== false)],
      ['Family Friendly', (c) => yesNo(c.familyFriendly !== false)],
    ],
    selectMenus: ['allowedChannels', 'blockedChannels', 'managerRoles'],
    toggles: [
      ['allowImages', '🖼️ Images'],
      ['allowGames', '🎮 Games'],
      ['familyFriendly', '🛡️ Family Friendly'],
    ],
  },
  polls: {
    route: 'admin:polls',
    key: 'polls',
    title: '📊 Polls',
    summary: 'Poll creation, voting and results.',
    status: 'Configure poll channels, manager roles, results and anonymous voting.',
    defaults: {
      enabled: true,
      defaultChannelId: null,
      resultsChannelId: null,
      managerRoleIds: [],
      anonymousVoting: false,
      allowMultipleChoice: true,
      showResultsLive: true,
    },
    fields: [
      ['Default Channel', (c) => formatChannel(c.defaultChannelId)],
      ['Results Channel', (c) => formatChannel(c.resultsChannelId)],
      ['Manager Roles', (c) => formatRoles(c.managerRoleIds)],
      ['Anonymous Voting', (c) => yesNo(c.anonymousVoting === true)],
      ['Multiple Choice', (c) => yesNo(c.allowMultipleChoice !== false)],
      ['Live Results', (c) => yesNo(c.showResultsLive !== false)],
    ],
    selectMenus: ['defaultChannel', 'resultsChannel', 'managerRoles'],
    toggles: [
      ['anonymousVoting', '👤 Anonymous Voting'],
      ['allowMultipleChoice', '☑️ Multiple Choice'],
      ['showResultsLive', '📈 Live Results'],
    ],
  },
};

const ROUTE_TO_KEY = Object.fromEntries(
  Object.values(MODULE_PANEL_REGISTRY).map((module) => [module.route, module.key])
);

const CHANNEL_FIELDS = {
  channels: { prop: 'channels', label: '📌 Sticky Channels', max: 10, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  submitChannel: { prop: 'submitChannelId', label: '💡 Submit Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  reviewChannel: { prop: 'reviewChannelId', label: '🔎 Review Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  approvedChannel: { prop: 'approvedChannelId', label: '✅ Approved Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  deniedChannel: { prop: 'deniedChannelId', label: '❌ Denied Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  announcementChannel: { prop: 'announcementChannelId', label: '🎉 Announcement Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  logChannel: { prop: 'logChannelId', label: '📋 Log Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  allowedChannels: { prop: 'allowedChannelIds', label: '✅ Allowed Channels', max: 10, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  blockedChannels: { prop: 'blockedChannelIds', label: '🚫 Blocked Channels', max: 10, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  defaultChannel: { prop: 'defaultChannelId', label: '📊 Default Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
  resultsChannel: { prop: 'resultsChannelId', label: '📈 Results Channel', max: 1, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] },
};

const ROLE_FIELDS = {
  managerRoles: { prop: 'managerRoleIds', label: '👥 Manager Roles', max: 10 },
  reviewerRoles: { prop: 'reviewerRoleIds', label: '🔎 Reviewer Roles', max: 10 },
};

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function yesNo(value) {
  return value ? 'Yes ✅' : 'No ❌';
}

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : '`Not set`';
}

function formatChannels(channelIds = []) {
  const ids = Array.isArray(channelIds) ? channelIds.filter(Boolean) : [];
  return ids.length ? ids.map((id) => `<#${id}>`).join(', ') : '`None`';
}

function formatRoles(roleIds = []) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  return ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function getModuleConfig(guildId, key) {
  const module = MODULE_PANEL_REGISTRY[key];
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.[key];
  const source = config && typeof config === 'object' ? config : { enabled: config !== false };
  return {
    ...(module?.defaults || { enabled: true }),
    ...source,
  };
}

function saveModuleConfig(guild, key, updater) {
  const current = getModuleConfig(guild.id, key);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  return guildManager.updateGuildSection(guild.id, 'modules', (modules) => ({
    ...modules,
    [key]: {
      ...next,
      updatedAt: new Date().toISOString(),
    },
  }), {}, guild);
}

function setModuleEnabled(guild, key, enabled) {
  return saveModuleConfig(guild, key, (config) => ({ ...config, enabled: Boolean(enabled) }));
}

function moduleStatusText(enabled) {
  return enabled ? 'Enabled ✅' : 'Disabled ❌';
}

function buildFieldList(module, config) {
  return module.fields
    .map(([label, formatter]) => `**${label}:** ${formatter(config)}`)
    .join('\n')
    .slice(0, 1024);
}

function buildSelectRows(moduleKey) {
  const module = MODULE_PANEL_REGISTRY[moduleKey];
  const rows = [];

  for (const fieldKey of module.selectMenus || []) {
    if (CHANNEL_FIELDS[fieldKey]) {
      const field = CHANNEL_FIELDS[fieldKey];
      rows.push(row(
        new ChannelSelectMenuBuilder()
          .setCustomId(`admin:module:${moduleKey}:channel:${fieldKey}`)
          .setPlaceholder(field.label)
          .setChannelTypes(...field.types)
          .setMinValues(0)
          .setMaxValues(field.max)
      ));
      continue;
    }

    if (ROLE_FIELDS[fieldKey]) {
      const field = ROLE_FIELDS[fieldKey];
      rows.push(row(
        new RoleSelectMenuBuilder()
          .setCustomId(`admin:module:${moduleKey}:role:${fieldKey}`)
          .setPlaceholder(field.label)
          .setMinValues(0)
          .setMaxValues(field.max)
      ));
    }
  }

  for (const optionMenu of module.optionMenus || []) {
    rows.push(row(
      new StringSelectMenuBuilder()
        .setCustomId(`admin:module:${moduleKey}:option:${optionMenu.id}`)
        .setPlaceholder(optionMenu.placeholder)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(optionMenu.options.map(([value, label, description]) => ({ value, label, description })))
    ));
  }

  return rows.slice(0, 3);
}

function buildToggleRows(moduleKey, config) {
  const module = MODULE_PANEL_REGISTRY[moduleKey];
  const toggles = module.toggles || [];
  const buttons = toggles.map(([prop, label]) => {
    const enabled = config[prop] !== false && config[prop] !== null && config[prop] !== undefined ? Boolean(config[prop]) : false;
    return button(`admin:module:${moduleKey}:toggle:${prop}`, `${label}: ${enabled ? 'On' : 'Off'}`, enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(row(...buttons.slice(i, i + 3)));
  return rows;
}

function buildModulePanel(guild, moduleKey, memberDisplayName = 'Unknown User') {
  const module = MODULE_PANEL_REGISTRY[moduleKey];
  if (!module) return null;

  const config = getModuleConfig(guild.id, module.key);
  const enabled = config.enabled !== false;

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : PANEL_COLOR)
    .setTitle(module.title)
    .setDescription([
      module.summary,
      '',
      `**Status:** ${moduleStatusText(enabled)}`,
      `**Module Key:** \`${module.key}\``,
      '',
      module.status,
    ].join('\n'))
    .addFields({ name: 'Current Setup', value: buildFieldList(module, config), inline: false })
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button(`admin:module:${module.key}:enable`, '▶️ Enable', ButtonStyle.Success),
        button(`admin:module:${module.key}:disable`, '⏸️ Disable', ButtonStyle.Secondary),
        button(`admin:module:${module.key}:reset`, '♻️ Reset', ButtonStyle.Danger)
      ),
      ...buildSelectRows(module.key),
      ...buildToggleRows(module.key, config),
      row(button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary)),
    ].slice(0, 5),
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function openTicketsPanel(interaction) {
  const { sendSetupPanel } = require('../../../modules/tickets/ticketSetupPanel');
  await sendSetupPanel(interaction);
  return true;
}

function updateChannelSelection(guild, moduleKey, fieldKey, values = []) {
  const field = CHANNEL_FIELDS[fieldKey];
  if (!field) return;
  const cleanValues = [...new Set((values || []).filter(Boolean))];
  saveModuleConfig(guild, moduleKey, (config) => ({
    ...config,
    [field.prop]: field.max === 1 ? cleanValues[0] || null : cleanValues,
  }));
}

function updateRoleSelection(guild, moduleKey, fieldKey, values = []) {
  const field = ROLE_FIELDS[fieldKey];
  if (!field) return;
  saveModuleConfig(guild, moduleKey, (config) => ({
    ...config,
    [field.prop]: [...new Set((values || []).filter(Boolean))],
  }));
}

function updateOptionSelection(guild, moduleKey, optionKey, value) {
  saveModuleConfig(guild, moduleKey, (config) => ({
    ...config,
    [optionKey]: value,
  }));
}

async function handleModuleAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (customId === 'admin:tickets') return openTicketsPanel(interaction);

  const routeKey = ROUTE_TO_KEY[customId];
  if (routeKey) return safeUpdate(interaction, buildModulePanel(interaction.guild, routeKey, getMemberDisplayName(interaction)));

  const buttonMatch = customId.match(/^admin:module:([a-zA-Z0-9_-]+):(enable|disable|reset)$/);
  if (buttonMatch && interaction.isButton?.()) {
    const [, moduleKey, action] = buttonMatch;
    if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;
    if (action === 'enable') setModuleEnabled(interaction.guild, moduleKey, true);
    if (action === 'disable') setModuleEnabled(interaction.guild, moduleKey, false);
    if (action === 'reset') saveModuleConfig(interaction.guild, moduleKey, MODULE_PANEL_REGISTRY[moduleKey].defaults);
    return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
  }

  const toggleMatch = customId.match(/^admin:module:([a-zA-Z0-9_-]+):toggle:([a-zA-Z0-9_-]+)$/);
  if (toggleMatch && interaction.isButton?.()) {
    const [, moduleKey, prop] = toggleMatch;
    if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;
    saveModuleConfig(interaction.guild, moduleKey, (config) => ({ ...config, [prop]: !Boolean(config[prop]) }));
    return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
  }

  const channelMatch = customId.match(/^admin:module:([a-zA-Z0-9_-]+):channel:([a-zA-Z0-9_-]+)$/);
  if (channelMatch && interaction.isChannelSelectMenu?.()) {
    const [, moduleKey, fieldKey] = channelMatch;
    if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;
    updateChannelSelection(interaction.guild, moduleKey, fieldKey, interaction.values);
    return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
  }

  const roleMatch = customId.match(/^admin:module:([a-zA-Z0-9_-]+):role:([a-zA-Z0-9_-]+)$/);
  if (roleMatch && interaction.isRoleSelectMenu?.()) {
    const [, moduleKey, fieldKey] = roleMatch;
    if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;
    updateRoleSelection(interaction.guild, moduleKey, fieldKey, interaction.values);
    return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
  }

  const optionMatch = customId.match(/^admin:module:([a-zA-Z0-9_-]+):option:([a-zA-Z0-9_-]+)$/);
  if (optionMatch && interaction.isStringSelectMenu?.()) {
    const [, moduleKey, optionKey] = optionMatch;
    if (!MODULE_PANEL_REGISTRY[moduleKey]) return false;
    updateOptionSelection(interaction.guild, moduleKey, optionKey, interaction.values?.[0]);
    return safeUpdate(interaction, buildModulePanel(interaction.guild, moduleKey, getMemberDisplayName(interaction)));
  }

  return false;
}

module.exports = {
  MODULE_PANEL_REGISTRY,
  buildModulePanel,
  handleModuleAdminInteraction,
};
