'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const roleManager = require('../../../modules/roles/roleManager');
const roleStore = require('../../../modules/roles/roleStore');

const MODULE_KEY = 'reactionRoles';
const PANEL_COLOR = '#5865F2';

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function getConfig(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.[MODULE_KEY];
  return {
    enabled: true,
    panelChannelId: null,
    roleIds: [],
    managerRoleIds: [],
    allowMultipleRoles: true,
    removeOnUnreact: true,
    ...(config && typeof config === 'object' ? config : {}),
  };
}

function saveConfig(guild, updater) {
  const current = getConfig(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  guildManager.updateGuildSection(guild.id, 'modules', (modules = {}) => ({
    ...modules,
    [MODULE_KEY]: {
      ...next,
      updatedAt: new Date().toISOString(),
    },
    roles: {
      ...(modules.roles && typeof modules.roles === 'object' ? modules.roles : {}),
      enabled: next.enabled !== false,
      updatedAt: new Date().toISOString(),
    },
  }), {}, guild);
  roleStore.setEnabled(guild.id, next.enabled !== false, guild);
  return getConfig(guild.id);
}

function formatRoles(roleIds = []) {
  const ids = Array.isArray(roleIds) ? roleIds.filter(Boolean) : [];
  return ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None selected`';
}

function formatChannel(channelId) {
  return channelId ? `<#${channelId}>` : '`Not set`';
}

function getPanelsSummary(guildId) {
  const panels = roleStore.getReactionPanels(guildId);
  if (!panels.length) return '`No deployed panels yet.`';
  return panels
    .slice(0, 5)
    .map((panel, index) => `**${index + 1}.** \`${panel.panelId}\` ${panel.channelId ? `<#${panel.channelId}>` : ''} — ${panel.roles?.length || 0} role(s)`)
    .join('\n');
}

function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = getConfig(guild.id);
  const panels = roleStore.getReactionPanels(guild.id);
  const selectedRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false ? 0x57f287 : PANEL_COLOR)
    .setTitle('😊 Reaction Roles')
    .setDescription([
      'Create a reaction-role panel using dropdowns from the Admin Menu.',
      '',
      `**Status:** ${config.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Panel Channel:** ${formatChannel(config.panelChannelId)}`,
      `**Selected Roles:** ${formatRoles(selectedRoles)}`,
      `**Allow Multiple Roles:** ${config.allowMultipleRoles !== false ? 'Yes ✅' : 'No ❌'}`,
      `**Stored Panels:** \`${panels.length}\``,
      '',
      '**Deployed Panels**',
      getPanelsSummary(guild.id),
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId('admin:reactionRoles:channel')
          .setPlaceholder('Choose panel channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(1)
      ),
      row(
        new RoleSelectMenuBuilder()
          .setCustomId('admin:reactionRoles:roles')
          .setPlaceholder('Choose roles for the panel')
          .setMinValues(0)
          .setMaxValues(10)
      ),
      row(
        button('admin:reactionRoles:deploy', '🚀 Deploy Panel', ButtonStyle.Success),
        button(config.enabled !== false ? 'admin:reactionRoles:disable' : 'admin:reactionRoles:enable', config.enabled !== false ? '⏸️ Disable' : '▶️ Enable', config.enabled !== false ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:reactionRoles:reset', '♻️ Reset', ButtonStyle.Danger)
      ),
      row(
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
    ],
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

async function deployPanel(interaction) {
  const config = getConfig(interaction.guild.id);
  if (config.enabled === false) throw new Error('Reaction Roles is disabled.');
  if (!config.panelChannelId) throw new Error('Choose a panel channel first.');

  const roleIds = Array.isArray(config.roleIds) ? config.roleIds.filter(Boolean) : [];
  if (!roleIds.length) throw new Error('Choose at least one role first.');

  const channel = interaction.guild.channels.cache.get(config.panelChannelId) || await interaction.guild.channels.fetch(config.panelChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Selected panel channel is not sendable.');

  await interaction.guild.roles.fetch().catch(() => null);

  const roles = [];
  for (const roleId of roleIds) {
    const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
    const safety = roleManager.validateRoleSafety(interaction.guild, role);
    if (!safety.ok) throw new Error(`${role?.name || roleId}: ${safety.reason}`);
    roles.push({
      id: roleStore.cleanKey(role.name || role.id),
      roleId: role.id,
      label: role.name.slice(0, 80),
      mode: config.allowMultipleRoles === false ? roleManager.ROLE_MODES.ADD : roleManager.ROLE_MODES.TOGGLE,
      groupId: config.allowMultipleRoles === false ? 'reaction_roles_default' : null,
      enabled: true,
      createdBy: interaction.user.id,
    });
  }

  saveConfig(interaction.guild, { enabled: true });

  return roleManager.createReactionPanel({
    guild: interaction.guild,
    channel,
    title: 'Reaction Roles',
    description: 'Click a button below to add or remove your roles.',
    roles,
    createdBy: interaction.user.id,
    source: 'admin-panel',
    sourceId: MODULE_KEY,
  });
}

async function handleReactionRolesAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:reactionRoles')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:reactionRoles') {
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:channel' && interaction.isChannelSelectMenu?.()) {
      const channelId = interaction.values?.[0] || null;
      saveConfig(interaction.guild, { panelChannelId: channelId });
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:roles' && interaction.isRoleSelectMenu?.()) {
      saveConfig(interaction.guild, { roleIds: [...new Set(interaction.values || [])] });
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:enable') {
      saveConfig(interaction.guild, { enabled: true });
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:disable') {
      saveConfig(interaction.guild, { enabled: false });
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:reset') {
      saveConfig(interaction.guild, { enabled: true, panelChannelId: null, roleIds: [], managerRoleIds: [], allowMultipleRoles: true, removeOnUnreact: true });
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:reactionRoles:deploy') {
      await interaction.deferUpdate().catch(() => null);
      await deployPanel(interaction);
      return safeUpdate(interaction, buildReactionRolesAdminPanel(interaction.guild, memberDisplayName));
    }

    return false;
  } catch (error) {
    const payload = {
      content: `❌ Reaction Roles setup failed: ${error.message}`,
      flags: 64,
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildReactionRolesAdminPanel,
  handleReactionRolesAdminInteraction,
};
