'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const guildManager = require('../../../core/guild/guildManager');
const security = require('../../../core/security/protection/core');
const emojis = require('../../utilityStudio/emojis/emojis');
const roleSelector = require('./roleSelector');
const healthService = require('./roleSelectorHealth');
const { withDeploymentLock } = require('./roleSelectorLocks');

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_TIMER_KEY = Symbol.for('goliath.roleSelector.panelSessionTimer');
const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const linkButton = (label, url) => new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';
const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user.id}`;
const cleanRoleId = (value) => {
  const id = String(value || '').replace(/[^0-9]/g, '');
  return /^\d{15,25}$/.test(id) ? id : null;
};

if (!globalThis[SESSION_TIMER_KEY]) {
  globalThis[SESSION_TIMER_KEY] = setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [key, value] of sessions) {
      if (Number(value?.touchedAt || 0) < cutoff) sessions.delete(key);
    }
  }, 10 * 60 * 1000);
  globalThis[SESSION_TIMER_KEY].unref?.();
}

function getState(interaction) {
  const key = sessionKey(interaction);
  let current = sessions.get(key) || {
    groupId: null,
    statsGroupId: null,
    statsOptionId: null,
    statsPage: 0,
    pendingDeploymentChannelId: null,
    pendingStatsChannelId: null,
    touchedAt: Date.now(),
  };
  if (Date.now() - Number(current.touchedAt || 0) > SESSION_TTL_MS) {
    current = {
      groupId: null,
      statsGroupId: null,
      statsOptionId: null,
      statsPage: 0,
      pendingDeploymentChannelId: null,
      pendingStatsChannelId: null,
      touchedAt: Date.now(),
    };
  }
  if (current.groupId && !roleSelector.getGroup(interaction.guildId, current.groupId)) current.groupId = null;
  current.touchedAt = Date.now();
  sessions.set(key, current);
  return current;
}

async function respond(interaction, payload) {
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: 64 });
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

function moduleNavRow(backId = 'admin:roleSelector', settingsDisabled = false) {
  return row(
    button(backId, '⬅️ Back'),
    button('admin:roleSelector:settings', '⚙️ Settings', ButtonStyle.Secondary, settingsDisabled),
  );
}

function rootNavRow() {
  return row(
    button('admin:studio:roleStudio', '⬅️ Back to Role Studio'),
    button('admin:roleSelector:settings', '⚙️ Settings'),
  );
}

async function resolveComponentShortcodes(guild, components = []) {
  const allowed = await emojis.allowedGuildEmojis(guild.client, guild.id);
  return (components || []).map((entry) => {
    const data = typeof entry?.toJSON === 'function' ? entry.toJSON() : entry;
    if (!data || typeof data !== 'object' || !Array.isArray(data.components)) return entry;
    return {
      ...data,
      components: data.components.map((component) => {
        if (!component || component.type !== 3 || !Array.isArray(component.options)) return component;
        return {
          ...component,
          options: component.options.map((option) => {
            const rawName = String(option?.emoji?.name || '');
            const shortcode = rawName.match(/^:([A-Za-z0-9_]{2,32}):$/);
            if (!shortcode) return option;
            const emoji = allowed.get(shortcode[1].toLowerCase());
            if (emoji) return { ...option, emoji: emojis.componentPayload(emoji) };
            const next = { ...option };
            delete next.emoji;
            return next;
          }),
        };
      }),
    };
  });
}

async function resolveMemberPayload(guild, payload = {}) {
  return {
    ...payload,
    content: payload.content == null ? payload.content : await emojis.resolveText(guild.client, guild.id, payload.content),
    embeds: await emojis.resolveEmbeds(guild.client, guild.id, payload.embeds || []),
    components: await resolveComponentShortcodes(guild, payload.components || []),
  };
}

async function freshMember(interaction) {
  return interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
}

async function freshMemberGroupPayload(interaction, groupId) {
  return resolveMemberPayload(interaction.guild, memberGroupPayload(interaction.guild, await freshMember(interaction), groupId));
}

function allGroups(guildId) {
  return roleSelector.listGroups(guildId);
}

function customGroups(guildId) {
  return allGroups(guildId).filter((group) => !group.builtIn);
}

function groupSelect(guildId, selectedId = null, customId = 'admin:roleSelector:groupSelect') {
  const groups = allGroups(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(groups.length ? 'Choose a group' : 'No groups available')
    .setMinValues(1)
    .setMaxValues(1);
  if (!groups.length) return row(menu.setDisabled(true).addOptions({ label: 'No groups available', value: '__none__' }));
  menu.addOptions(groups.map((group) => ({
    label: `${group.emoji || '🏷️'} ${group.name}`.slice(0, 100),
    value: group.id,
    description: (group.builtIn
      ? 'Built-in group · protected'
      : `${group.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'} · ${(group.options || []).length} options`).slice(0, 100),
    default: group.id === selectedId,
  })));
  return row(menu);
}

function memberCategorySelect(guild, selectedId = null, customId = 'roleSelector:switchGroup') {
  const groups = roleSelector.listGroups(guild.id).filter(roleSelector.isGroupMemberUsable).slice(0, 25);
  const selected = selectedId ? groups.find((group) => group.id === selectedId) : null;
  const placeholder = selected ? `Current: ${selected.name} · choose or switch` : 'Choose a category';
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder.slice(0, 150)).setMinValues(1).setMaxValues(1);
  if (!groups.length) return row(menu.setDisabled(true).addOptions({ label: 'No selectors available', value: '__none__' }));
  menu.addOptions(groups.map((group) => ({
    label: `${group.emoji || '🏷️'} ${group.name}`.slice(0, 100),
    value: group.id,
    description: (group.description || (group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one')).slice(0, 100),
  })));
  return row(menu);
}

function memberDisabledPayload() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x747F8D)
      .setTitle('🎭 Role Selector')
      .setDescription('Role Selector is currently unavailable. An administrator can re-enable it from Role Studio.')],
    components: [],
  };
}

function memberLauncherPayload(guild) {
  if (!guildManager.isModuleEnabled(guild.id, roleSelector.MODULE)) return memberDisabledPayload();
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 Choose Your Roles')
      .setDescription('Choose a category below. Each category manages only its own roles, so changing one selection never removes roles from another category.')],
    components: [memberCategorySelect(guild, null, 'roleSelector:openGroup')],
  };
}

function memberGroupPayload(guild, member, groupId) {
  roleSelector.assertModuleEnabled(guild.id);
  const group = roleSelector.getGroup(guild.id, groupId);
  if (!group || !roleSelector.isGroupMemberUsable(group)) throw new Error('That selector is unavailable.');
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${group.emoji || '🏷️'} ${group.name}`).setDescription([
    group.description || 'Choose your role.',
    group.selectionMode === 'multiple' ? 'Select every option that applies.' : 'Select one option.',
    group.allowRemove ? 'You may clear this category at any time.' : null,
  ].filter(Boolean).join('\n'));
  const components = [memberCategorySelect(guild, group.id)];

  if (group.type === 'colour') {
    const options = group.palette.filter((item) => item.enabled).sort((a, b) => a.order - b.order).slice(0, 24).map((item) => {
      const managedRoleId = group.managedRoles?.[item.hex]?.roleId;
      return {
        label: item.label,
        value: item.hex,
        emoji: item.emoji || undefined,
        description: `${item.hex} · ${item.family}`.slice(0, 100),
        default: Boolean(managedRoleId && member?.roles?.cache?.has(managedRoleId)),
      };
    });
    if (options.length) components.push(row(new StringSelectMenuBuilder().setCustomId('roleSelector:colourChoose').setPlaceholder('Choose a colour').setMinValues(1).setMaxValues(1).addOptions(options)));
    components.push(row(
      group.customHexEnabled ? button('roleSelector:customHex', '🎨 Pick Your Own', ButtonStyle.Primary) : null,
      group.allowRemove ? button('roleSelector:clear:colours', '🧹 Clear Selection') : null,
    ));
  } else {
    const options = (group.options || []).filter((item) => item.enabled).sort((a, b) => a.order - b.order).slice(0, 25).map((item) => ({
      label: item.label,
      value: item.id,
      emoji: item.emoji || undefined,
      description: item.description || undefined,
      default: Boolean(item.roleId && member?.roles?.cache?.has(item.roleId)),
    }));
    if (options.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`roleSelector:choose:${group.id}`)
      .setPlaceholder(group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one')
      .setMinValues(group.selectionMode === 'multiple' ? 0 : 1)
      .setMaxValues(group.selectionMode === 'multiple' ? options.length : 1)
      .addOptions(options)));
    if (group.allowRemove) components.push(row(button(`roleSelector:clear:${group.id}`, '🧹 Clear Selection')));
  }
  return { embeds: [embed], components: components.filter((item) => item.components.length) };
}

async function buildAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = roleSelector.getSection(guild.id);
  const health = await healthService.buildHealth(guild);
  const usage = await roleSelector.getUsage(guild);
  const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE);
  return {
    embeds: [new EmbedBuilder()
      .setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A)
      .setTitle('🎭 Role Selector')
      .setDescription([
        'Universal self-role categories with Colours built in.', '',
        `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
        `**Groups:** ${roleSelector.listGroups(guild.id).length} (${customGroups(guild.id).length} custom)`,
        `**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,
        `**Managed roles:** ${health.managedRoleCount}`,
        `**Format:** \`${roleSelector.roleNameFor(section, 'Example Role')}\``,
        `**Anchor:** ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}> (${section.style.placement})` : '`Not set`'}`,
        `**Deployment:** ${section.deployment.channelId ? `<#${section.deployment.channelId}>` : '`Not deployed`'}`,
        `**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : `Not ready ⚠️ (${health.acceptance?.failed?.length || 0} blocker(s))`}`,
        '', health.issues.length || health.warnings.length ? `⚠️ ${health.issues.length + health.warnings.length} health issue/warning(s)` : '✅ Health checks passed',
      ].join('\n'))
      .setFooter({ text: `Requested by ${requestedBy}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:roleSelector:groups', '🏷️ Groups', ButtonStyle.Primary),
        button('admin:roleSelector:style', '🎨 Appearance', ButtonStyle.Primary),
        button('admin:roleSelector:deployment', '📍 Deployment', ButtonStyle.Primary),
      ),
      rootNavRow(),
    ],
  };
}

async function buildSettingsPanel(guild) {
  const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE);
  const health = await healthService.buildHealth(guild);
  return {
    embeds: [new EmbedBuilder().setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A).setTitle('⚙️ Role Selector · Settings').setDescription([
      `**Module:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
      `**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : 'Not ready ⚠️'}`,
      '', 'Module controls, usage and diagnostics live here.',
    ].join('\n'))],
    components: [
      row(
        button(enabled ? 'admin:roleSelector:disable' : 'admin:roleSelector:enable', enabled ? '⏸ Disable' : '▶ Enable', enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
        button('admin:roleSelector:stats', '📊 Stats', ButtonStyle.Primary),
        button('admin:roleSelector:health', '🩺 Health / Repair'),
      ),
      moduleNavRow('admin:roleSelector', true),
    ],
  };
}

function buildGroupsPanel(interaction) {
  const state = getState(interaction);
  const selected = state.groupId ? roleSelector.getGroup(interaction.guildId, state.groupId) : null;
  if (!selected) {
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription([
        'Create and manage self-role categories.',
        'Select an existing group below, or create a new custom group.',
        '', '🌈 **Colours** is the protected built-in group and follows the same management flow.',
      ].join('\n'))],
      components: [
        groupSelect(interaction.guildId),
        row(button('admin:roleSelector:createGroup', '➕ Create Group', ButtonStyle.Success)),
        moduleNavRow(),
      ],
    };
  }

  if (selected.type === 'colour') return buildColourGroupPanel(interaction.guild, selected);

  const options = selected.options || [];
  const optionLines = options.length
    ? options.map((item) => {
      const roleState = item.managed === false ? 'Existing role' : item.roleId ? 'Goliath-managed' : 'Auto-create';
      return `${item.enabled ? '✅' : '⬜'} ${item.emoji || '•'} **${item.label}** · Role: ${roleState}`;
    }).join('\n')
    : '`No options yet`';

  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription([
      `${selected.emoji || '🏷️'} **${selected.name}**`,
      selected.description || '`No description`', '',
      `**Type:** ${selected.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'}`,
      `**Options:** ${options.length}`,
      `**Members can clear:** ${selected.allowRemove ? 'Yes ✅' : 'No'}`,
      '', optionLines,
    ].join('\n').slice(0, 4096))],
    components: [
      groupSelect(interaction.guildId, selected.id),
      row(
        button('admin:roleSelector:options', '📝 Manage Options', ButtonStyle.Primary),
        button('admin:roleSelector:groupSettings', '⚙️ Group Settings', ButtonStyle.Primary),
      ),
      row(button('admin:roleSelector:deleteGroup', '🗑️ Delete Group', ButtonStyle.Danger)),
      moduleNavRow(),
    ],
  };
}

function buildColourGroupPanel(guild, group = roleSelector.getGroup(guild.id, roleSelector.COLOUR_GROUP_ID)) {
  const palette = [...group.palette].sort((a, b) => a.order - b.order).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:palette').setPlaceholder('Enabled preset colours').setMinValues(0).setMaxValues(Math.max(1, palette.length)).addOptions(palette.map((item) => ({
    label: item.label,
    value: item.id,
    emoji: item.emoji || undefined,
    description: item.hex,
    default: item.enabled,
  })));
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌈 Role Selector · Groups · Colours').setDescription([
      '**Built-in group 🔒**',
      'Choose which preset colours members can select. Custom HEX colours are automatically positioned within the colour hierarchy.', '',
      ...palette.map((item) => `${item.enabled ? '✅' : '⬜'} ${item.emoji} **${item.label}** · \`${item.hex}\``), '',
      `**Custom HEX:** ${group.customHexEnabled ? 'Enabled ✅' : 'Disabled'}`,
      `**Members can clear:** ${group.allowRemove ? 'Yes ✅' : 'No'}`,
    ].join('\n'))],
    components: [
      groupSelect(guild.id, group.id),
      row(menu),
      row(
        button('admin:roleSelector:toggleHex', group.customHexEnabled ? '🎨 Custom HEX: On' : '🎨 Custom HEX: Off', group.customHexEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:roleSelector:colourClearToggle', group.allowRemove ? '🧹 Allow Clear: Yes' : '🧹 Allow Clear: No'),
      ),
      moduleNavRow(),
    ],
  };
}

function buildGroupSettingsPanel(interaction) {
  const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
  if (!group || group.builtIn) throw new Error('Select a custom group first.');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`⚙️ ${group.emoji || '🏷️'} ${group.name} · Group Settings`).setDescription([
      `**Selection type:** ${group.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'}`,
      `**Allow members to clear selection:** ${group.allowRemove ? 'Yes ✅' : 'No'}`,
      '', 'These settings only affect this group.',
    ].join('\n'))],
    components: [
      row(
        button('admin:roleSelector:toggleMode', group.selectionMode === 'multiple' ? '☑️ Multiple Choices' : '1️⃣ Single Choice', ButtonStyle.Primary),
        button('admin:roleSelector:toggleRemove', group.allowRemove ? '🧹 Allow Clear: Yes' : '🧹 Allow Clear: No'),
      ),
      moduleNavRow('admin:roleSelector:groups'),
    ],
  };
}

function buildAppearancePanel(guild) {
  const section = roleSelector.getSection(guild.id);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Role Selector · Appearance').setDescription([
      '**Role Style**',
      `Format: \`${roleSelector.roleNameFor(section, 'Example Role')}\``,
      section.style.detectedFormat ? `Detected suggestion: \`${section.style.detectedFormat}\`` : 'Detected suggestion: `Not scanned`', '',
      '**Role Placement**',
      `Anchor: ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}>${section.style.anchorManaged ? ' · Goliath-managed' : ''}` : '`Not set`'}`,
      `Placement: **${section.style.placement}**`,
      `Keep roles together: **${section.style.keepGrouped ? 'Yes ✅' : 'No'}**`, '',
      'Only Goliath-managed Role Selector roles are automatically repositioned.',
    ].join('\n'))],
    components: [
      row(new RoleSelectMenuBuilder().setCustomId('admin:roleSelector:anchor').setPlaceholder('Select divider / anchor role').setMinValues(0).setMaxValues(1)),
      row(
        button('admin:roleSelector:styleOpen', '✏️ Edit Format', ButtonStyle.Primary),
        button('admin:roleSelector:scanStyle', '🔎 Scan Guild Style'),
        button('admin:roleSelector:createDivider', '➕ Create Divider', ButtonStyle.Success),
      ),
      row(
        button('admin:roleSelector:togglePlacement', section.style.placement === 'above' ? '📍 Place Above' : '📍 Place Below', ButtonStyle.Primary),
        button('admin:roleSelector:toggleGrouped', section.style.keepGrouped ? '🧲 Keep Together: On' : '🧲 Keep Together: Off', section.style.keepGrouped ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      row(section.style.detectedFormat ? button('admin:roleSelector:applyStyle', '✅ Apply Suggestion', ButtonStyle.Success) : null),
      moduleNavRow(),
    ].filter((entry) => entry.components.length),
  };
}

function deploymentRecord(section) {
  return section?.deployment || { channelId: null, messageId: null };
}

function statsDeploymentRecord(section) {
  const value = section?.statsDeployment && typeof section.statsDeployment === 'object' ? section.statsDeployment : {};
  return { channelId: cleanRoleId(value.channelId), messageId: cleanRoleId(value.messageId) };
}

async function fetchDeployment(guild, deployment) {
  if (!deployment?.channelId) return { channel: null, message: null };
  const channel = guild.channels.cache.get(deployment.channelId) || await guild.channels.fetch(deployment.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return { channel, message: null };
  const message = deployment.messageId ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
  return { channel, message };
}

function ownedByGoliath(guild, message) {
  return Boolean(message && (!guild.client?.user?.id || message.author?.id === guild.client.user.id));
}

async function retireDeploymentUnlocked(guild, deployment) {
  const { message } = await fetchDeployment(guild, deployment);
  if (!ownedByGoliath(guild, message)) return false;
  await message.edit(memberDisabledPayload()).catch(() => null);
  return true;
}

async function deleteDeploymentUnlocked(guild, deployment) {
  const { message } = await fetchDeployment(guild, deployment);
  if (!message) return true;
  if (!ownedByGoliath(guild, message)) throw new Error('Goliath will not delete a deployment message it does not own.');
  await message.delete().catch(() => null);
  return true;
}

async function syncDeploymentState(guild) {
  return withDeploymentLock(guild.id, async () => {
    const section = roleSelector.getSection(guild.id);
    const deployment = deploymentRecord(section);
    const { message } = await fetchDeployment(guild, deployment);
    if (!message) {
      if (deployment.messageId) roleSelector.updateSection(guild.id, (current) => ({ ...current, deployment: { ...current.deployment, messageId: null } }), { action: 'role_selector_deployment_missing' });
      return { updated: false, reason: deployment.messageId ? 'message_missing' : 'not_deployed' };
    }
    if (!ownedByGoliath(guild, message)) {
      roleSelector.updateSection(guild.id, (current) => ({ ...current, deployment: { ...current.deployment, messageId: null } }), { action: 'role_selector_deployment_not_owned' });
      return { updated: false, reason: 'message_not_owned' };
    }
    await message.edit(await resolveMemberPayload(guild, memberLauncherPayload(guild)));
    return { updated: true, messageId: message.id, channelId: message.channel.id };
  });
}

async function retireDeployment(guild, deployment) {
  return withDeploymentLock(guild.id, () => retireDeploymentUnlocked(guild, deployment));
}

async function deploySelector(interaction) {
  return withDeploymentLock(interaction.guildId, async () => {
    const section = roleSelector.getSection(interaction.guildId);
    const deployment = deploymentRecord(section);
    const channelId = deployment.channelId || interaction.channelId;
    const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.send) throw new Error('Choose a sendable text channel.');
    let message = deployment.messageId && deployment.channelId === channel.id ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
    if (message && !ownedByGoliath(interaction.guild, message)) message = null;
    const payload = await resolveMemberPayload(interaction.guild, memberLauncherPayload(interaction.guild));
    message = message ? await message.edit(payload) : await channel.send(payload);
    roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: 'role_selector_deploy' });
    return message;
  });
}

async function buildDeploymentPanel(interaction) {
  const section = roleSelector.getSection(interaction.guildId);
  const deployment = deploymentRecord(section);
  const { message } = await fetchDeployment(interaction.guild, deployment);
  const channelName = deployment.channelId ? interaction.guild.channels.cache.get(deployment.channelId)?.name : null;
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('admin:roleSelector:deploymentChannel')
    .setPlaceholder(channelName ? `Current: #${channelName} · choose to change` : 'Choose deployment channel')
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const jumpUrl = message ? `https://discord.com/channels/${interaction.guildId}/${message.channel.id}/${message.id}` : null;
  return {
    content: null,
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📍 Role Selector · Deployment').setDescription([
      `**Channel:** ${deployment.channelId ? `<#${deployment.channelId}>` : '`Not selected`'}`,
      `**Message:** ${message ? 'Deployed ✅' : 'Not deployed'}`, '',
      'Choose where the member-facing Role Selector lives. If you move an existing deployment, Goliath will ask whether to remove or retire the old panel first.',
    ].join('\n'))],
    components: [
      row(menu),
      row(
        button('admin:roleSelector:deploy', message ? '🔄 Update Selector' : '📨 Deploy Selector', ButtonStyle.Success, !deployment.channelId),
        jumpUrl ? linkButton('↗️ Jump to Selector', jumpUrl) : null,
      ),
      moduleNavRow(),
    ].filter((entry) => entry.components.length),
  };
}

async function buildDeploymentMovePanel(interaction, targetChannelId) {
  const section = roleSelector.getSection(interaction.guildId);
  const deployment = deploymentRecord(section);
  return {
    embeds: [new EmbedBuilder().setColor(0xFAA61A).setTitle('📍 Move Role Selector Deployment?').setDescription([
      `Current: ${deployment.channelId ? `<#${deployment.channelId}>` : '`None`'}`,
      `New: <#${targetChannelId}>`, '',
      '**Remove Old Panel & Move** deletes the old Goliath-owned message.',
      '**Retire Old Panel & Move** keeps the old message but disables it.',
    ].join('\n'))],
    components: [
      row(
        button('admin:roleSelector:moveRemove', '🗑️ Remove Old Panel & Move', ButtonStyle.Danger),
        button('admin:roleSelector:moveRetire', '📦 Retire Old Panel & Move', ButtonStyle.Primary),
      ),
      row(button('admin:roleSelector:moveCancel', '⬅️ Back')),
    ],
  };
}

async function moveDeployment(interaction, mode) {
  const targetChannelId = getState(interaction).pendingDeploymentChannelId;
  if (!targetChannelId) throw new Error('Choose a new deployment channel first.');
  return withDeploymentLock(interaction.guildId, async () => {
    const section = roleSelector.getSection(interaction.guildId);
    const current = deploymentRecord(section);
    const channel = interaction.guild.channels.cache.get(targetChannelId) || await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel?.send) throw new Error('Choose a sendable text channel.');
    if (mode === 'remove') await deleteDeploymentUnlocked(interaction.guild, current);
    else await retireDeploymentUnlocked(interaction.guild, current);
    const payload = await resolveMemberPayload(interaction.guild, memberLauncherPayload(interaction.guild));
    const message = await channel.send(payload);
    roleSelector.updateSection(interaction.guildId, (value) => ({ ...value, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: `role_selector_move_${mode}` });
    getState(interaction).pendingDeploymentChannelId = null;
    return message;
  });
}

function flattenUsage(usage) {
  const rows = [];
  for (const group of usage.groups || []) {
    for (const item of group.rows || []) rows.push({ ...item, groupId: group.id, groupName: group.name, groupEmoji: group.emoji || '🏷️' });
  }
  return rows;
}

async function buildStatsPanel(guild) {
  const usage = await roleSelector.getUsage(guild);
  const flat = flattenUsage(usage).sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const totalSelections = flat.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const groupsInUse = (usage.groups || []).filter((group) => (group.rows || []).some((item) => Number(item.count || 0) > 0)).length;
  const leaderboard = flat.filter((item) => Number(item.count || 0) > 0).slice(0, 10);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector · Stats').setDescription([
      `**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,
      `**Total selections:** ${totalSelections}`,
      `**Groups in use:** ${groupsInUse}/${(usage.groups || []).length}`, '',
      '**🏆 Most Selected**',
      leaderboard.length ? leaderboard.map((item, index) => `${index + 1}. ${item.groupEmoji} **${item.label}** — ${item.count} · ${item.groupName}`).join('\n') : '`No selections yet`',
    ].join('\n'))],
    components: [
      groupSelect(guild.id, null, 'admin:roleSelector:statsGroup'),
      row(button('admin:roleSelector:statsPublic', '📣 Public Stats Panel', ButtonStyle.Primary)),
      moduleNavRow('admin:roleSelector:settings', true),
    ],
  };
}

async function buildStatsGroupPanel(interaction, groupId) {
  const usage = await roleSelector.getUsage(interaction.guild, groupId);
  const group = usage.groups?.[0];
  if (!group) throw new Error('That group is unavailable.');
  const state = getState(interaction);
  state.statsGroupId = groupId;
  const rows = group.rows || [];
  if (state.statsOptionId && !rows.some((item) => String(item.id || item.key || item.label) === state.statsOptionId)) state.statsOptionId = null;
  const optionMenu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:statsOption').setPlaceholder('Choose an option to inspect members').setMinValues(1).setMaxValues(1);
  if (rows.length) optionMenu.addOptions(rows.slice(0, 25).map((item) => ({
    label: String(item.label || 'Option').slice(0, 100),
    value: String(item.id || item.key || item.label).slice(0, 100),
    description: `${item.count || 0} member(s)`.slice(0, 100),
    default: String(item.id || item.key || item.label) === state.statsOptionId,
  })));
  else optionMenu.setDisabled(true).addOptions({ label: 'No options available', value: '__none__' });
  const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${group.emoji || '🏷️'} ${group.name}`).setDescription([
      `**Selections:** ${total}`, '',
      rows.length ? rows.map((item, index) => `${index + 1}. **${item.label}** — ${item.count || 0}`).join('\n') : '`No selections yet`',
    ].join('\n').slice(0, 4096))],
    components: [
      row(optionMenu),
      row(button('admin:roleSelector:statsMembers', '👥 View Members', ButtonStyle.Primary, !state.statsOptionId)),
      moduleNavRow('admin:roleSelector:stats', true),
    ],
  };
}

async function buildStatsMembersPanel(interaction, pageDelta = 0) {
  const state = getState(interaction);
  const usage = await roleSelector.getUsage(interaction.guild, state.statsGroupId);
  const group = usage.groups?.[0];
  if (!group) throw new Error('That group is unavailable.');
  const selected = (group.rows || []).find((item) => String(item.id || item.key || item.label) === state.statsOptionId);
  if (!selected) throw new Error('Choose an option first.');
  const members = selected.members || [];
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(members.length / pageSize));
  state.statsPage = Math.min(pages - 1, Math.max(0, Number(state.statsPage || 0) + pageDelta));
  const slice = members.slice(state.statsPage * pageSize, (state.statsPage + 1) * pageSize);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`👥 ${group.name} · ${selected.label}`).setDescription([
      `**Members:** ${members.length}`, `**Page:** ${state.statsPage + 1}/${pages}`, '',
      slice.length ? slice.map((member) => `<@${member.id}>`).join('\n') : '`Nobody currently has this selection.`',
    ].join('\n').slice(0, 4096))],
    components: [
      row(
        button('admin:roleSelector:statsMembersPrev', '⬅️ Previous', ButtonStyle.Secondary, state.statsPage <= 0),
        button('admin:roleSelector:statsMembersNext', 'Next ➡️', ButtonStyle.Secondary, state.statsPage >= pages - 1),
      ),
      moduleNavRow('admin:roleSelector:statsGroupBack', true),
    ],
  };
}

async function buildPublicStatsPayload(guild) {
  const usage = await roleSelector.getUsage(guild);
  const flat = flattenUsage(usage).sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const totalSelections = flat.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const leaderboard = flat.filter((item) => Number(item.count || 0) > 0).slice(0, 10);
  const groupTotals = (usage.groups || []).map((group) => ({
    ...group,
    total: (group.rows || []).reduce((sum, item) => sum + Number(item.count || 0), 0),
  })).sort((a, b) => b.total - a.total);
  const menu = new StringSelectMenuBuilder().setCustomId('roleSelector:publicStatsGroup').setPlaceholder('View a group breakdown').setMinValues(1).setMaxValues(1);
  if (groupTotals.length) menu.addOptions(groupTotals.slice(0, 25).map((group) => ({
    label: `${group.emoji || '🏷️'} ${group.name}`.slice(0, 100),
    value: group.id,
    description: `${group.total} selection(s)`.slice(0, 100),
  })));
  else menu.setDisabled(true).addOptions({ label: 'No groups available', value: '__none__' });
  return resolveMemberPayload(guild, {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector Leaderboard').setDescription([
      'See what the community is choosing.', '',
      `👥 **Members using selectors:** ${usage.totalUsing}`,
      `🎯 **Total selections:** ${totalSelections}`, '',
      '**🏆 Top Choices**',
      leaderboard.length ? leaderboard.map((item, index) => `${index + 1}. ${item.groupEmoji} **${item.label}** — ${item.count}`).join('\n') : '`No selections yet`', '',
      groupTotals[0]?.total ? `**Most Popular Group:** ${groupTotals[0].emoji || '🏷️'} ${groupTotals[0].name} — ${groupTotals[0].total}` : null,
    ].filter(Boolean).join('\n'))],
    components: [row(menu)],
  });
}

async function buildPublicGroupStatsPayload(guild, groupId) {
  const usage = await roleSelector.getUsage(guild, groupId);
  const group = usage.groups?.[0];
  if (!group) throw new Error('That group is unavailable.');
  return resolveMemberPayload(guild, {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${group.emoji || '🏷️'} ${group.name}`).setDescription([
      'Community selection counts:', '',
      (group.rows || []).length ? group.rows.map((item, index) => `${index + 1}. **${item.label}** — ${item.count || 0}`).join('\n') : '`No selections yet`',
    ].join('\n').slice(0, 4096))],
    components: [],
  });
}

async function syncStatsDeploymentState(guild) {
  const section = roleSelector.getSection(guild.id);
  const deployment = statsDeploymentRecord(section);
  const { message } = await fetchDeployment(guild, deployment);
  if (!message) {
    if (deployment.messageId) roleSelector.updateSection(guild.id, (current) => ({ ...current, statsDeployment: { ...statsDeploymentRecord(current), messageId: null } }), { action: 'role_selector_stats_deployment_missing' });
    return { updated: false };
  }
  if (!ownedByGoliath(guild, message)) {
    roleSelector.updateSection(guild.id, (current) => ({ ...current, statsDeployment: { ...statsDeploymentRecord(current), messageId: null } }), { action: 'role_selector_stats_deployment_not_owned' });
    return { updated: false };
  }
  await message.edit(await buildPublicStatsPayload(guild));
  return { updated: true, messageId: message.id, channelId: message.channel.id };
}

async function syncConfiguredPanels(guild) {
  await Promise.allSettled([syncDeploymentState(guild), syncStatsDeploymentState(guild)]);
}

async function buildStatsDeploymentPanel(interaction) {
  const section = roleSelector.getSection(interaction.guildId);
  const deployment = statsDeploymentRecord(section);
  const { message } = await fetchDeployment(interaction.guild, deployment);
  const channelName = deployment.channelId ? interaction.guild.channels.cache.get(deployment.channelId)?.name : null;
  const menu = new ChannelSelectMenuBuilder().setCustomId('admin:roleSelector:statsDeploymentChannel').setPlaceholder(channelName ? `Current: #${channelName} · choose to change` : 'Choose public stats channel').setMinValues(1).setMaxValues(1).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const jumpUrl = message ? `https://discord.com/channels/${interaction.guildId}/${message.channel.id}/${message.id}` : null;
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Role Selector · Public Stats Panel').setDescription([
      `**Channel:** ${deployment.channelId ? `<#${deployment.channelId}>` : '`Not selected`'}`,
      `**Message:** ${message ? 'Deployed ✅' : 'Not deployed'}`, '',
      'Deploy a user-visible community leaderboard. Counts update in place; member names remain admin-only.',
    ].join('\n'))],
    components: [
      row(menu),
      row(
        button('admin:roleSelector:statsDeploy', message ? '🔄 Update Public Panel' : '📨 Deploy Public Panel', ButtonStyle.Success, !deployment.channelId),
        jumpUrl ? linkButton('↗️ Jump to Panel', jumpUrl) : null,
      ),
      moduleNavRow('admin:roleSelector:stats', true),
    ].filter((entry) => entry.components.length),
  };
}

async function buildStatsMovePanel(interaction, targetChannelId) {
  const current = statsDeploymentRecord(roleSelector.getSection(interaction.guildId));
  return {
    embeds: [new EmbedBuilder().setColor(0xFAA61A).setTitle('📣 Move Public Stats Panel?').setDescription([
      `Current: ${current.channelId ? `<#${current.channelId}>` : '`None`'}`,
      `New: <#${targetChannelId}>`, '',
      'Choose what Goliath should do with the old panel.',
    ].join('\n'))],
    components: [
      row(
        button('admin:roleSelector:statsMoveRemove', '🗑️ Remove Old Panel & Move', ButtonStyle.Danger),
        button('admin:roleSelector:statsMoveRetire', '📦 Retire Old Panel & Move', ButtonStyle.Primary),
      ),
      row(button('admin:roleSelector:statsMoveCancel', '⬅️ Back')),
    ],
  };
}

async function deployStatsPanel(interaction) {
  const section = roleSelector.getSection(interaction.guildId);
  const deployment = statsDeploymentRecord(section);
  const channelId = deployment.channelId || interaction.channelId;
  const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) throw new Error('Choose a sendable text channel.');
  let message = deployment.messageId && deployment.channelId === channel.id ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
  if (message && !ownedByGoliath(interaction.guild, message)) message = null;
  const payload = await buildPublicStatsPayload(interaction.guild);
  message = message ? await message.edit(payload) : await channel.send(payload);
  roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, statsDeployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: 'role_selector_stats_deploy' });
  return message;
}

async function moveStatsDeployment(interaction, mode) {
  const targetChannelId = getState(interaction).pendingStatsChannelId;
  if (!targetChannelId) throw new Error('Choose a new public stats channel first.');
  const section = roleSelector.getSection(interaction.guildId);
  const current = statsDeploymentRecord(section);
  const channel = interaction.guild.channels.cache.get(targetChannelId) || await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Choose a sendable text channel.');
  const { message: oldMessage } = await fetchDeployment(interaction.guild, current);
  if (oldMessage) {
    if (!ownedByGoliath(interaction.guild, oldMessage)) throw new Error('Goliath will not modify a public stats message it does not own.');
    if (mode === 'remove') await oldMessage.delete().catch(() => null);
    else await oldMessage.edit({ embeds: [new EmbedBuilder().setColor(0x747F8D).setTitle('📊 Role Selector Leaderboard').setDescription('This leaderboard has moved to a new channel.')], components: [] }).catch(() => null);
  }
  const message = await channel.send(await buildPublicStatsPayload(interaction.guild));
  roleSelector.updateSection(interaction.guildId, (value) => ({ ...value, statsDeployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: `role_selector_stats_move_${mode}` });
  getState(interaction).pendingStatsChannelId = null;
  return message;
}

function formatHealthEntry(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.detail || entry?.message || entry?.code || JSON.stringify(entry);
}

async function buildHealthPanel(guild, repairResult = null) {
  const health = repairResult || await healthService.buildHealth(guild);
  const issues = (health.issues || []).map(formatHealthEntry);
  const warnings = (health.warnings || []).map(formatHealthEntry);
  const failedChecks = (health.acceptance?.checks || []).filter((check) => !check.passed).map((check) => check.detail || check.name || 'Acceptance check failed');
  return {
    embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFAA61A).setTitle('🩺 Role Selector · Health / Repair').setDescription([
      `**Overall Health:** ${health.healthy ? 'Healthy ✅' : 'Needs Attention ⚠️'}`,
      `**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : 'Not Ready ⚠️'}`,
      `**Managed Roles:** ${health.managedRoleCount || 0}`, '',
      '**Issues**', issues.length ? issues.map((item) => `• ${item}`).join('\n') : '✅ No issues', '',
      '**Warnings**', warnings.length ? warnings.map((item) => `• ${item}`).join('\n') : '✅ No warnings', '',
      failedChecks.length ? `**Still needs attention**\n${failedChecks.slice(0, 8).map((item) => `• ${item}`).join('\n')}` : '**Still needs attention**\n✅ No acceptance blockers detected.',
    ].join('\n').slice(0, 4096))],
    components: [
      row(
        button('admin:roleSelector:healthCheck', '🔍 Run Check', ButtonStyle.Primary),
        button('admin:roleSelector:healthRepair', '🛠️ Repair Safe Issues', ButtonStyle.Success),
      ),
      moduleNavRow('admin:roleSelector:settings', true),
    ],
  };
}

function createGroupModal() {
  return new ModalBuilder().setCustomId('admin:roleSelector:createGroupSubmit').setTitle('Create Role Selector Group').addComponents(
    row(new TextInputBuilder().setCustomId('name').setLabel('Group name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Gaming Platform')),
    row(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji / icon').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('🎮 or :emoji_name:')),
    row(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)),
    row(new TextInputBuilder().setCustomId('mode').setLabel('Selection type: single or multiple').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setValue('single')),
  );
}

function optionsModal(group) {
  return new ModalBuilder().setCustomId('admin:roleSelector:optionsSubmit').setTitle(`Options · ${group.name}`.slice(0, 45)).addComponents(
    row(new TextInputBuilder().setCustomId('options').setLabel('emoji | label | description | roleId').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue((group.options || []).map((item) => `${item.emoji || ''} | ${item.label} | ${item.description || ''} | ${item.managed === false ? item.roleId || '' : ''}`).join('\n')).setPlaceholder('🎮 | Xbox | Xbox players |\n:playstation: | PlayStation | PS players | 123456789012345678')),
  );
}

function styleModal(section) {
  return new ModalBuilder().setCustomId('admin:roleSelector:styleSubmit').setTitle('Role Selector Appearance').addComponents(
    row(new TextInputBuilder().setCustomId('format').setLabel('Role format').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(section.style.format || '🎭 | {role}').setPlaceholder('♥️ | {role}')),
    row(new TextInputBuilder().setCustomId('icon').setLabel('Default icon / prefix').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(section.style.icon || '')),
    row(new TextInputBuilder().setCustomId('separator').setLabel('Separator').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setValue(section.style.separator || '|')),
  );
}

function dividerModal() {
  return new ModalBuilder().setCustomId('admin:roleSelector:createDividerSubmit').setTitle('Create Role Selector Divider').addComponents(
    row(new TextInputBuilder().setCustomId('name').setLabel('Divider role name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue('🎭 | ROLE SELECTOR')),
  );
}

function hexModal() {
  return new ModalBuilder().setCustomId('roleSelector:customHexSubmit').setTitle('Pick Your Own Colour').addComponents(
    row(new TextInputBuilder().setCustomId('hex').setLabel('HEX colour').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#1EA7FF')),
    row(new TextInputBuilder().setCustomId('label').setLabel('Colour name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('Sky Blue')),
  );
}

async function handleRoleSelectorInteraction(interaction) {
  const id = String(interaction.customId || '');
  const actor = { actorId: interaction.user?.id };
  if (!id.startsWith('admin:roleSelector') && !id.startsWith('roleSelector:') && !id.startsWith('admin:colourRoles') && !id.startsWith('colourRoles:')) return false;
  try {
    const adminControl = id.startsWith('admin:roleSelector') || id.startsWith('admin:colourRoles');
    if (adminControl) {
      const access = await security.enforceInteractionSecurity(interaction, { level: 'admin', guildOnly: true });
      if (!access.allowed) return true;
    }

    if (id === 'admin:colourRoles' || id === 'admin:roleSelector' || id === 'admin:roleSelector:home') return respond(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:roleSelector:settings') return respond(interaction, await buildSettingsPanel(interaction.guild));

    if (id === 'admin:roleSelector:enable' || id === 'admin:roleSelector:disable') {
      guildManager.setModuleEnabled(interaction.guildId, roleSelector.MODULE, id.endsWith(':enable'), { ...actor, action: id });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, await buildSettingsPanel(interaction.guild));
    }

    if (id === 'admin:roleSelector:groups') {
      getState(interaction).groupId = null;
      return respond(interaction, buildGroupsPanel(interaction));
    }
    if (id === 'admin:roleSelector:groupSelect' && interaction.values?.[0] !== '__none__') {
      getState(interaction).groupId = interaction.values[0];
      return respond(interaction, buildGroupsPanel(interaction));
    }
    if (id === 'admin:roleSelector:createGroup') {
      await interaction.showModal(createGroupModal());
      return true;
    }
    if (id === 'admin:roleSelector:createGroupSubmit') {
      const rawMode = interaction.fields.getTextInputValue('mode').trim().toLowerCase();
      if (!['single', 'multiple'].includes(rawMode)) throw new Error('Selection type must be single or multiple.');
      const group = await roleSelector.saveGroupSafe(interaction.guild, {
        name: interaction.fields.getTextInputValue('name'),
        emoji: interaction.fields.getTextInputValue('emoji'),
        description: interaction.fields.getTextInputValue('description'),
        selectionMode: rawMode,
        allowRemove: true,
        options: [],
      }, { ...actor, action: 'role_selector_create_group' });
      getState(interaction).groupId = group.id;
      await syncConfiguredPanels(interaction.guild);
      return interaction.reply({ content: `✅ Created **${group.name}**.`, ...buildGroupsPanel(interaction), flags: 64 });
    }
    if (id === 'admin:roleSelector:options') {
      const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      await interaction.showModal(optionsModal(group));
      return true;
    }
    if (id === 'admin:roleSelector:optionsSubmit') {
      const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      const byLabel = new Map((group.options || []).map((item) => [item.label.toLowerCase(), item]));
      const options = interaction.fields.getTextInputValue('options').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 25).map((line, index) => {
        const [emoji, label, description, roleIdRaw] = line.split('|').map((part) => part.trim());
        if (!label) throw new Error(`Option ${index + 1} needs a label.`);
        const previous = byLabel.get(label.toLowerCase());
        const existingRoleId = cleanRoleId(roleIdRaw);
        return { ...(previous || {}), id: previous?.id, emoji, label, description, roleId: existingRoleId || previous?.roleId || null, managed: existingRoleId ? false : previous?.managed !== false, enabled: true, order: (index + 1) * 10 };
      });
      for (const option of options) {
        if (!option.roleId || option.managed !== false) continue;
        const role = interaction.guild.roles.cache.get(option.roleId) || await interaction.guild.roles.fetch(option.roleId).catch(() => null);
        roleSelector.assertSafeSelectorRole(interaction.guild, role);
      }
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, options }, { ...actor, action: 'role_selector_update_options' });
      await syncConfiguredPanels(interaction.guild);
      return interaction.reply({ content: '✅ Selector options saved.', ...buildGroupsPanel(interaction), flags: 64 });
    }
    if (id === 'admin:roleSelector:groupSettings') return respond(interaction, buildGroupSettingsPanel(interaction));
    if (id === 'admin:roleSelector:toggleMode') {
      const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, selectionMode: group.selectionMode === 'multiple' ? 'single' : 'multiple' }, { ...actor, action: 'role_selector_toggle_mode' });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildGroupSettingsPanel(interaction));
    }
    if (id === 'admin:roleSelector:toggleRemove') {
      const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, allowRemove: !group.allowRemove }, { ...actor, action: 'role_selector_toggle_remove' });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildGroupSettingsPanel(interaction));
    }
    if (id === 'admin:roleSelector:deleteGroup') {
      const group = roleSelector.getGroup(interaction.guildId, getState(interaction).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      const result = await roleSelector.deleteManagedGroupRoles(interaction.guild, group.id);
      if (result.unresolved) {
        const names = result.unresolvedRoles.map((item) => `@${item.name}`).join(', ');
        throw new Error(`Group not deleted because ${result.unresolved} Goliath-managed role(s) could not be removed${names ? `: ${names}` : '.'}. Move them below Goliath or fix Manage Roles, then retry.`);
      }
      roleSelector.removeGroup(interaction.guildId, group.id, { ...actor, action: 'role_selector_delete_group' });
      getState(interaction).groupId = null;
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildGroupsPanel(interaction));
    }
    if (id === 'admin:roleSelector:palette') {
      const group = roleSelector.getGroup(interaction.guildId, roleSelector.COLOUR_GROUP_ID);
      const selected = new Set(interaction.values || []);
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, palette: group.palette.map((item) => ({ ...item, enabled: selected.has(item.id) })) }, { ...actor, action: 'role_selector_palette' });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildColourGroupPanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:toggleHex') {
      const group = roleSelector.getGroup(interaction.guildId, roleSelector.COLOUR_GROUP_ID);
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, customHexEnabled: !group.customHexEnabled }, { ...actor, action: 'role_selector_hex_toggle' });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildColourGroupPanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:colourClearToggle') {
      const group = roleSelector.getGroup(interaction.guildId, roleSelector.COLOUR_GROUP_ID);
      await roleSelector.saveGroupSafe(interaction.guild, { ...group, allowRemove: !group.allowRemove }, { ...actor, action: 'role_selector_colour_clear_toggle' });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildColourGroupPanel(interaction.guild));
    }

    if (id === 'admin:roleSelector:style') return respond(interaction, buildAppearancePanel(interaction.guild));
    if (id === 'admin:roleSelector:styleOpen') {
      await interaction.showModal(styleModal(roleSelector.getSection(interaction.guildId)));
      return true;
    }
    if (id === 'admin:roleSelector:styleSubmit') {
      roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, format: interaction.fields.getTextInputValue('format'), icon: interaction.fields.getTextInputValue('icon'), separator: interaction.fields.getTextInputValue('separator') || '|' } }), { ...actor, action: 'role_selector_style' });
      await roleSelector.syncManagedRoleAppearance(interaction.guild);
      await syncConfiguredPanels(interaction.guild);
      return interaction.reply({ content: '✅ Role appearance updated.', ...buildAppearancePanel(interaction.guild), flags: 64 });
    }
    if (id === 'admin:roleSelector:createDivider') {
      await interaction.showModal(dividerModal());
      return true;
    }
    if (id === 'admin:roleSelector:createDividerSubmit') {
      const divider = await interaction.guild.roles.create({ name: interaction.fields.getTextInputValue('name').trim().slice(0, 100), permissions: [], hoist: false, mentionable: false, reason: 'Goliath Role Selector divider' });
      try {
        await roleSelector.setAnchorRole(interaction.guild, divider.id, { managed: true, meta: { ...actor, action: 'role_selector_create_divider' } });
      } catch (error) {
        await divider.delete('Unsafe Role Selector divider').catch(() => null);
        throw error;
      }
      await syncConfiguredPanels(interaction.guild);
      return interaction.reply({ content: `✅ Created divider **${divider.name}**.`, ...buildAppearancePanel(interaction.guild), flags: 64 });
    }
    if (id === 'admin:roleSelector:anchor') {
      await roleSelector.setAnchorRole(interaction.guild, interaction.values?.[0] || null, { managed: false, meta: { ...actor, action: 'role_selector_anchor' } });
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildAppearancePanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:togglePlacement') {
      roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, placement: current.style.placement === 'above' ? 'below' : 'above' } }), { ...actor, action: 'role_selector_placement' });
      await roleSelector.syncManagedRoleHierarchy(interaction.guild);
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildAppearancePanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:toggleGrouped') {
      roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, keepGrouped: !current.style.keepGrouped } }), { ...actor, action: 'role_selector_grouping' });
      await roleSelector.syncManagedRoleHierarchy(interaction.guild);
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildAppearancePanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:scanStyle') {
      const suggestion = roleSelector.suggestRoleStyle(interaction.guild);
      roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, detectedFormat: suggestion.format, detectedIcon: suggestion.icon, detectedSeparator: suggestion.separator, detectedConfidence: suggestion.confidence } }), { ...actor, action: 'role_selector_style_scan' });
      return respond(interaction, buildAppearancePanel(interaction.guild));
    }
    if (id === 'admin:roleSelector:applyStyle') {
      roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, format: current.style.detectedFormat || current.style.format, icon: current.style.detectedIcon || '', separator: current.style.detectedSeparator || current.style.separator } }), { ...actor, action: 'role_selector_style_apply' });
      await roleSelector.syncManagedRoleAppearance(interaction.guild);
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, buildAppearancePanel(interaction.guild));
    }

    if (id === 'admin:roleSelector:deployment') return respond(interaction, await buildDeploymentPanel(interaction));
    if (id === 'admin:roleSelector:deploymentChannel') {
      const target = interaction.values?.[0];
      const current = deploymentRecord(roleSelector.getSection(interaction.guildId));
      if (!target) throw new Error('Choose a deployment channel.');
      if (current.messageId && current.channelId && current.channelId !== target) {
        getState(interaction).pendingDeploymentChannelId = target;
        return respond(interaction, await buildDeploymentMovePanel(interaction, target));
      }
      roleSelector.updateSection(interaction.guildId, (value) => ({ ...value, deployment: { channelId: target, messageId: current.channelId === target ? current.messageId : null } }), { ...actor, action: 'role_selector_deployment_channel' });
      return respond(interaction, await buildDeploymentPanel(interaction));
    }
    if (id === 'admin:roleSelector:moveCancel') {
      getState(interaction).pendingDeploymentChannelId = null;
      return respond(interaction, await buildDeploymentPanel(interaction));
    }
    if (id === 'admin:roleSelector:moveRemove' || id === 'admin:roleSelector:moveRetire') {
      const message = await moveDeployment(interaction, id.endsWith('Remove') ? 'remove' : 'retire');
      const payload = await buildDeploymentPanel(interaction);
      payload.content = `✅ Role Selector moved to <#${message.channel.id}>.`;
      return respond(interaction, payload);
    }
    if (id === 'admin:roleSelector:deploy') {
      const message = await deploySelector(interaction);
      const payload = await buildDeploymentPanel(interaction);
      payload.content = `✅ Role Selector deployed in <#${message.channel.id}>.`;
      return respond(interaction, payload);
    }

    if (id === 'admin:roleSelector:stats') return respond(interaction, await buildStatsPanel(interaction.guild));
    if (id === 'admin:roleSelector:statsGroup' && interaction.values?.[0] !== '__none__') {
      const state = getState(interaction);
      state.statsGroupId = interaction.values[0];
      state.statsOptionId = null;
      state.statsPage = 0;
      return respond(interaction, await buildStatsGroupPanel(interaction, interaction.values[0]));
    }
    if (id === 'admin:roleSelector:statsOption' && interaction.values?.[0] !== '__none__') {
      getState(interaction).statsOptionId = interaction.values[0];
      getState(interaction).statsPage = 0;
      return respond(interaction, await buildStatsGroupPanel(interaction, getState(interaction).statsGroupId));
    }
    if (id === 'admin:roleSelector:statsMembers') return respond(interaction, await buildStatsMembersPanel(interaction, 0));
    if (id === 'admin:roleSelector:statsMembersPrev') return respond(interaction, await buildStatsMembersPanel(interaction, -1));
    if (id === 'admin:roleSelector:statsMembersNext') return respond(interaction, await buildStatsMembersPanel(interaction, 1));
    if (id === 'admin:roleSelector:statsGroupBack') return respond(interaction, await buildStatsGroupPanel(interaction, getState(interaction).statsGroupId));
    if (id === 'admin:roleSelector:statsPublic') return respond(interaction, await buildStatsDeploymentPanel(interaction));
    if (id === 'admin:roleSelector:statsDeploymentChannel') {
      const target = interaction.values?.[0];
      const current = statsDeploymentRecord(roleSelector.getSection(interaction.guildId));
      if (!target) throw new Error('Choose a public stats channel.');
      if (current.messageId && current.channelId && current.channelId !== target) {
        getState(interaction).pendingStatsChannelId = target;
        return respond(interaction, await buildStatsMovePanel(interaction, target));
      }
      roleSelector.updateSection(interaction.guildId, (value) => ({ ...value, statsDeployment: { channelId: target, messageId: current.channelId === target ? current.messageId : null } }), { ...actor, action: 'role_selector_stats_channel' });
      return respond(interaction, await buildStatsDeploymentPanel(interaction));
    }
    if (id === 'admin:roleSelector:statsMoveCancel') {
      getState(interaction).pendingStatsChannelId = null;
      return respond(interaction, await buildStatsDeploymentPanel(interaction));
    }
    if (id === 'admin:roleSelector:statsMoveRemove' || id === 'admin:roleSelector:statsMoveRetire') {
      const message = await moveStatsDeployment(interaction, id.endsWith('Remove') ? 'remove' : 'retire');
      const payload = await buildStatsDeploymentPanel(interaction);
      payload.content = `✅ Public stats panel moved to <#${message.channel.id}>.`;
      return respond(interaction, payload);
    }
    if (id === 'admin:roleSelector:statsDeploy') {
      const message = await deployStatsPanel(interaction);
      const payload = await buildStatsDeploymentPanel(interaction);
      payload.content = `✅ Public stats panel deployed in <#${message.channel.id}>.`;
      return respond(interaction, payload);
    }

    if (id === 'admin:roleSelector:health') return respond(interaction, await buildHealthPanel(interaction.guild));
    if (id === 'admin:roleSelector:healthCheck') return respond(interaction, await buildHealthPanel(interaction.guild));
    if (id === 'admin:roleSelector:healthRepair') {
      const health = await healthService.repair(interaction.guild);
      await syncConfiguredPanels(interaction.guild);
      return respond(interaction, await buildHealthPanel(interaction.guild, health));
    }

    if (id.startsWith('roleSelector:')) roleSelector.assertModuleEnabled(interaction.guildId);
    if (id === 'roleSelector:openGroup') {
      if (interaction.values?.[0] === '__none__') return interaction.reply({ content: 'No selector groups are available.', flags: 64 });
      return interaction.reply({ ...(await freshMemberGroupPayload(interaction, interaction.values[0])), flags: 64 });
    }
    if (id === 'roleSelector:switchGroup') {
      if (interaction.values?.[0] === '__none__') return interaction.update(memberDisabledPayload());
      return interaction.update(await freshMemberGroupPayload(interaction, interaction.values[0]));
    }
    if (id === 'roleSelector:colourChoose') {
      await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.values[0]);
      await interaction.update(await freshMemberGroupPayload(interaction, roleSelector.COLOUR_GROUP_ID));
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      await interaction.followUp({ content: '✅ Your colour has been updated.', flags: 64 });
      return true;
    }
    if (id === 'roleSelector:customHex') {
      await interaction.showModal(hexModal());
      return true;
    }
    if (id === 'roleSelector:customHexSubmit') {
      await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.fields.getTextInputValue('hex'), interaction.fields.getTextInputValue('label'));
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      return interaction.reply({ content: '✅ Your custom colour has been applied.', flags: 64 });
    }
    if (id.startsWith('roleSelector:choose:')) {
      const groupId = id.split(':').slice(2).join(':');
      await roleSelector.applyStandardSelection(interaction.guild, interaction.member, groupId, interaction.values || []);
      await interaction.update(await freshMemberGroupPayload(interaction, groupId));
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      await interaction.followUp({ content: '✅ Your role selection has been updated.', flags: 64 });
      return true;
    }
    if (id.startsWith('roleSelector:clear:')) {
      const groupId = id.split(':').slice(2).join(':');
      await roleSelector.clearSelection(interaction.guild, interaction.member, groupId);
      await interaction.update(await freshMemberGroupPayload(interaction, groupId));
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      await interaction.followUp({ content: '✅ Your selection has been cleared.', flags: 64 });
      return true;
    }
    if (id === 'roleSelector:publicStatsGroup') {
      if (interaction.values?.[0] === '__none__') return interaction.reply({ content: 'No groups are available.', flags: 64 });
      return interaction.reply({ ...(await buildPublicGroupStatsPayload(interaction.guild, interaction.values[0])), flags: 64 });
    }

    if (id.startsWith('colourRoles:')) roleSelector.assertModuleEnabled(interaction.guildId);
    if (id === 'colourRoles:choose') {
      await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.values[0]);
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      return interaction.reply({ content: '✅ Your colour has been updated.', flags: 64 });
    }
    if (id === 'colourRoles:remove') {
      await roleSelector.clearSelection(interaction.guild, interaction.member, roleSelector.COLOUR_GROUP_ID);
      await syncStatsDeploymentState(interaction.guild).catch(() => null);
      return interaction.reply({ content: '✅ Your colour has been removed.', flags: 64 });
    }
    if (id === 'colourRoles:custom') {
      await interaction.showModal(hexModal());
      return true;
    }
    return true;
  } catch (error) {
    console.error('[RoleSelectorPanel]', error);
    const payload = { content: `❌ ${error.message || 'Role Selector failed.'}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildAdminPanel,
  handleRoleSelectorInteraction,
  memberDisabledPayload,
  memberLauncherPayload,
  retireDeployment,
  syncDeploymentState,
};