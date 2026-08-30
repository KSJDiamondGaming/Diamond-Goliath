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
const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const linkButton = (label, url) => new ButtonBuilder().setLabel(label).setURL(url).setStyle(ButtonStyle.Link);
const cleanId = (value) => {
  const id = String(value || '').replace(/[^0-9]/g, '');
  return /^\d{15,25}$/.test(id) ? id : null;
};
const sessionKey = (i) => `${i.guildId}:${i.user.id}`;
const actorName = (i) => i.member?.displayName || i.user?.username || 'Unknown User';

function state(i) {
  const key = sessionKey(i);
  const value = sessions.get(key) || {
    groupId: null,
    deploymentId: null,
    deploymentContentGroupId: null,
    statsGroupId: null,
    statsOptionId: null,
    statsPage: 0,
    pendingChannelId: null,
    pendingStatsChannelId: null,
  };
  sessions.set(key, value);
  return value;
}

async function respond(i, payload) {
  if (i.isModalSubmit?.()) return i.reply({ ...payload, flags: 64 });
  if (i.deferred || i.replied) return i.editReply(payload);
  return i.update(payload);
}

function nav(back = 'admin:roleSelector', settingsDisabled = false) {
  return row(
    button(back, '⬅️ Back'),
    button('admin:roleSelector:settings', '⚙️ Settings', ButtonStyle.Secondary, settingsDisabled),
  );
}

function rootNav() {
  return row(
    button('admin:studio:roleStudio', '⬅️ Back to Role Studio'),
    button('admin:roleSelector:settings', '⚙️ Settings'),
  );
}

function groups(guildId) { return roleSelector.listGroups(guildId); }
function customGroups(guildId) { return groups(guildId).filter((g) => !g.builtIn); }

async function resolveComponents(guild, components = []) {
  const allowed = await emojis.allowedGuildEmojis(guild.client, guild.id);
  return components.map((entry) => {
    const data = typeof entry?.toJSON === 'function' ? entry.toJSON() : entry;
    if (!data?.components) return entry;
    return {
      ...data,
      components: data.components.map((component) => {
        if (component.type !== 3 || !Array.isArray(component.options)) return component;
        return {
          ...component,
          options: component.options.map((option) => {
            const match = String(option?.emoji?.name || '').match(/^:([A-Za-z0-9_]{2,32}):$/);
            if (!match) return option;
            const found = allowed.get(match[1].toLowerCase());
            if (found) return { ...option, emoji: emojis.componentPayload(found) };
            const next = { ...option };
            delete next.emoji;
            return next;
          }),
        };
      }),
    };
  });
}

async function resolvePayload(guild, payload) {
  return {
    ...payload,
    content: payload.content == null ? payload.content : await emojis.resolveText(guild.client, guild.id, payload.content),
    embeds: await emojis.resolveEmbeds(guild.client, guild.id, payload.embeds || []),
    components: await resolveComponents(guild, payload.components || []),
  };
}

function groupMenu(guildId, selected = null, customId = 'admin:roleSelector:groupSelect', multi = false, selectedIds = []) {
  const list = groups(guildId).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(multi ? 'Choose groups for this panel' : 'Choose a group')
    .setMinValues(multi ? 0 : 1)
    .setMaxValues(multi ? Math.max(1, list.length) : 1);
  if (!list.length) return row(menu.setDisabled(true).addOptions({ label: 'No groups available', value: '__none__' }));
  menu.addOptions(list.map((g) => ({
    label: `${g.emoji || '🏷️'} ${g.name}`.slice(0, 100),
    value: g.id,
    description: (g.builtIn ? 'Built-in group · protected' : `${g.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'} · ${(g.options || []).length} options`).slice(0, 100),
    default: multi ? selectedIds.includes(g.id) : g.id === selected,
  })));
  return row(menu);
}

function memberCategoryMenu(guild, allowedIds = null, selected = null, customId = 'roleSelector:switchGroup') {
  const allowed = Array.isArray(allowedIds) ? new Set(allowedIds) : null;
  const list = groups(guild.id)
    .filter((g) => roleSelector.isGroupMemberUsable(g) && (!allowed || allowed.has(g.id)))
    .slice(0, 25);
  const current = list.find((g) => g.id === selected);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(current ? `Current: ${current.name} · choose or switch`.slice(0, 150) : 'Choose a category')
    .setMinValues(1)
    .setMaxValues(1);
  if (!list.length) return row(menu.setDisabled(true).addOptions({ label: 'No selectors available', value: '__none__' }));
  menu.addOptions(list.map((g) => ({
    label: `${g.emoji || '🏷️'} ${g.name}`.slice(0, 100),
    value: g.id,
    description: (g.description || 'Choose your roles').slice(0, 100),
  })));
  return row(menu);
}

function memberDisabledPayload() {
  return {
    embeds: [new EmbedBuilder().setColor(0x747F8D).setTitle('🎭 Role Selector').setDescription('Role Selector is currently unavailable.')],
    components: [],
  };
}

function optionFilterFor(deployment, groupId) {
  const value = deployment?.optionIdsByGroup?.[groupId];
  return Array.isArray(value) ? new Set(value.map(String)) : null;
}

function memberLauncherPayload(guild, allowedIds = null, deploymentId = null) {
  if (!guildManager.isModuleEnabled(guild.id, roleSelector.MODULE)) return memberDisabledPayload();
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎭 Choose Your Roles').setDescription('Choose a category below. Each category manages only its own roles.')],
    components: [memberCategoryMenu(guild, allowedIds, null, deploymentId ? `roleSelector:openGroup:${deploymentId}` : 'roleSelector:openGroup')],
  };
}

function memberGroupPayload(guild, member, groupId, allowedIds = null, deploymentId = null, deployment = null) {
  roleSelector.assertModuleEnabled(guild.id);
  const group = roleSelector.getGroup(guild.id, groupId);
  if (!group || !roleSelector.isGroupMemberUsable(group) || (Array.isArray(allowedIds) && !allowedIds.includes(group.id))) {
    throw new Error('That selector is unavailable on this panel.');
  }

  const components = [memberCategoryMenu(guild, allowedIds, group.id, deploymentId ? `roleSelector:switchGroup:${deploymentId}` : 'roleSelector:switchGroup')];
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${group.emoji || '🏷️'} ${group.name}`)
    .setDescription([
      group.description || 'Choose your role.',
      group.selectionMode === 'multiple' ? 'Select every option that applies.' : 'Select one option.',
      group.allowRemove ? 'You may clear this category at any time.' : null,
    ].filter(Boolean).join('\n'));

  if (group.type === 'colour') {
    const opts = group.palette.filter((x) => x.enabled).sort((a, b) => a.order - b.order).slice(0, 24).map((x) => ({
      label: x.label,
      value: x.hex,
      emoji: x.emoji || undefined,
      description: `${x.hex} · ${x.family}`.slice(0, 100),
      default: Boolean(group.managedRoles?.[x.hex]?.roleId && member?.roles?.cache?.has(group.managedRoles[x.hex].roleId)),
    }));
    if (opts.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`roleSelector:colourChoose:${deploymentId || 'global'}`).setPlaceholder('Choose a colour').setMinValues(1).setMaxValues(1).addOptions(opts)));
    components.push(row(
      group.customHexEnabled ? button(`roleSelector:customHex:${deploymentId || 'global'}`, '🎨 Pick Your Own', ButtonStyle.Primary) : null,
      group.allowRemove ? button(`roleSelector:clear:colours:${deploymentId || 'global'}`, '🧹 Clear Selection') : null,
    ));
  } else {
    const filter = optionFilterFor(deployment, group.id);
    const opts = (group.options || [])
      .filter((x) => x.enabled && (!filter || filter.has(x.id)))
      .sort((a, b) => a.order - b.order)
      .slice(0, 25)
      .map((x) => ({
        label: x.label,
        value: x.id,
        emoji: x.emoji || undefined,
        description: x.description || undefined,
        default: Boolean(x.roleId && member?.roles?.cache?.has(x.roleId)),
      }));
    if (opts.length) components.push(row(new StringSelectMenuBuilder()
      .setCustomId(`roleSelector:choose:${group.id}:${deploymentId || 'global'}`)
      .setPlaceholder(group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one')
      .setMinValues(group.selectionMode === 'multiple' ? 0 : 1)
      .setMaxValues(group.selectionMode === 'multiple' ? opts.length : 1)
      .addOptions(opts)));
    if (group.allowRemove) components.push(row(button(`roleSelector:clear:${group.id}:${deploymentId || 'global'}`, '🧹 Clear Selection')));
  }
  return { embeds: [embed], components: components.filter((x) => x.components.length) };
}

async function freshMember(i) { return i.guild.members.fetch(i.user.id).catch(() => i.member); }

function normalizeDeployment(raw, fallbackId = null) {
  const id = String(raw?.id || fallbackId || '').trim() || `panel-${Date.now().toString(36)}`;
  const optionIdsByGroup = {};
  if (raw?.optionIdsByGroup && typeof raw.optionIdsByGroup === 'object') {
    for (const [groupId, ids] of Object.entries(raw.optionIdsByGroup)) {
      if (Array.isArray(ids)) optionIdsByGroup[groupId] = [...new Set(ids.map(String))].slice(0, 25);
    }
  }
  return {
    id,
    channelId: cleanId(raw?.channelId),
    messageId: cleanId(raw?.messageId),
    groupIds: Array.isArray(raw?.groupIds) ? [...new Set(raw.groupIds.map(String))].slice(0, 25) : [],
    optionIdsByGroup,
    status: raw?.status === 'retired' ? 'retired' : 'active',
    createdAt: raw?.createdAt || new Date().toISOString(),
  };
}

function groupsFromSection(section) {
  return (section?.groupOrder || Object.keys(section?.groups || {})).filter((id) => section?.groups?.[id]);
}

function deploymentList(section) {
  let list = Array.isArray(section?.deployments) ? section.deployments.map((d) => normalizeDeployment(d)) : [];
  if (!list.length && section?.deployment?.channelId) {
    list = [normalizeDeployment({
      id: 'legacy',
      channelId: section.deployment.channelId,
      messageId: section.deployment.messageId,
      groupIds: groupsFromSection(section),
      status: 'active',
    })];
  }
  return list;
}

function saveDeployments(guildId, list, meta = {}) {
  return roleSelector.updateSection(guildId, (current) => ({
    ...current,
    deployments: list.map((d) => normalizeDeployment(d)),
    deployment: { channelId: null, messageId: null },
  }), meta);
}

function deploymentById(guildId, id) {
  return deploymentList(roleSelector.getSection(guildId)).find((d) => d.id === id) || null;
}

function deploymentAllowedGroups(guildId, deploymentId) {
  if (!deploymentId || deploymentId === 'global') return null;
  const deployment = deploymentById(guildId, deploymentId);
  return deployment ? deployment.groupIds : [];
}

async function fetchDeployment(guild, deployment) {
  if (!deployment?.channelId) return { channel: null, message: null };
  const channel = guild.channels.cache.get(deployment.channelId) || await guild.channels.fetch(deployment.channelId).catch(() => null);
  const message = channel?.messages?.fetch && deployment.messageId ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
  return { channel, message };
}

function owned(guild, message) {
  return Boolean(message && (!guild.client?.user?.id || message.author?.id === guild.client.user.id));
}

async function deploymentPayload(guild, deployment) {
  return resolvePayload(guild, memberLauncherPayload(guild, deployment.groupIds, deployment.id));
}

async function syncOneDeployment(guild, deployment) {
  if (deployment.status === 'retired') return { updated: false, reason: 'retired' };
  const { message } = await fetchDeployment(guild, deployment);
  if (!message || !owned(guild, message)) return { updated: false, reason: message ? 'not_owned' : 'missing' };
  await message.edit(await deploymentPayload(guild, deployment));
  return { updated: true, messageId: message.id, channelId: message.channel.id };
}

async function syncDeploymentState(guild, changedGroupId = null) {
  return withDeploymentLock(guild.id, async () => {
    const list = deploymentList(roleSelector.getSection(guild.id));
    const targets = changedGroupId ? list.filter((d) => d.groupIds.includes(changedGroupId)) : list;
    const results = [];
    for (const deployment of targets) {
      results.push(await syncOneDeployment(guild, deployment).catch((error) => ({ updated: false, reason: error.message })));
    }
    return { updated: results.some((r) => r.updated), results };
  });
}

async function retireDeployment(guild, deployment) {
  return withDeploymentLock(guild.id, async () => {
    const value = typeof deployment === 'string' ? deploymentById(guild.id, deployment) : deployment;
    if (!value) return false;
    const { message } = await fetchDeployment(guild, value);
    if (!owned(guild, message)) return false;
    await message.edit(memberDisabledPayload()).catch(() => null);
    return true;
  });
}

async function buildAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = roleSelector.getSection(guild.id);
  const health = await healthService.buildHealth(guild);
  const usage = await roleSelector.getUsage(guild);
  const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE);
  const deployments = deploymentList(section);
  return {
    embeds: [new EmbedBuilder()
      .setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A)
      .setTitle('🎭 Role Selector')
      .setDescription([
        `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
        `**Groups:** ${groups(guild.id).length} (${customGroups(guild.id).length} custom)`,
        `**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,
        `**Deployments:** ${deployments.filter((d) => d.status === 'active').length} active`,
        `**Format:** \`${roleSelector.roleNameFor(section, 'Example Role')}\``,
        `**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : 'Not ready ⚠️'}`,
      ].join('\n'))
      .setFooter({ text: `Requested by ${requestedBy}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:roleSelector:groups', '🏷️ Groups', ButtonStyle.Primary),
        button('admin:roleSelector:style', '🎨 Appearance', ButtonStyle.Primary),
        button('admin:roleSelector:deployment', '📍 Deployments', ButtonStyle.Primary),
      ),
      rootNav(),
    ],
  };
}

async function buildSettingsPanel(guild) {
  const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE);
  const health = await healthService.buildHealth(guild);
  return {
    embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFAA61A).setTitle('⚙️ Role Selector · Settings').setDescription([
      `**Module:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}`,
      '', 'Module controls, usage and diagnostics live here.',
    ].join('\n'))],
    components: [
      row(
        button(enabled ? 'admin:roleSelector:disable' : 'admin:roleSelector:enable', enabled ? '⏸ Disable' : '▶ Enable'),
        button('admin:roleSelector:stats', '📊 Stats', ButtonStyle.Primary),
        button('admin:roleSelector:health', '🩺 Health / Repair'),
      ),
      nav('admin:roleSelector', true),
    ],
  };
}

function buildGroupsPanel(i) {
  const current = state(i);
  const selected = current.groupId ? roleSelector.getGroup(i.guildId, current.groupId) : null;
  if (!selected) {
    return {
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription('Create and manage self-role categories.\n\n🌈 **Colours** is the protected built-in group.')],
      components: [groupMenu(i.guildId), row(button('admin:roleSelector:createGroup', '➕ Create Group', ButtonStyle.Success)), nav()],
    };
  }
  if (selected.type === 'colour') return buildColourPanel(i.guild, selected);
  const lines = (selected.options || []).map((x) => `${x.enabled ? '✅' : '⬜'} ${x.emoji || '•'} **${x.label}** · Role: ${x.managed === false ? 'Existing role' : x.roleId ? 'Goliath-managed' : 'Auto-create'}`);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Groups').setDescription([
      `${selected.emoji || '🏷️'} **${selected.name}**`,
      selected.description || '`No description`', '',
      `**Type:** ${selected.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'}`,
      `**Options:** ${(selected.options || []).length}`,
      `**Members can clear:** ${selected.allowRemove ? 'Yes ✅' : 'No'}`, '',
      lines.join('\n') || '`No options yet`',
    ].join('\n').slice(0, 4096))],
    components: [
      groupMenu(i.guildId, selected.id),
      row(button('admin:roleSelector:options', '📝 Manage Options', ButtonStyle.Primary), button('admin:roleSelector:groupSettings', '⚙️ Group Settings', ButtonStyle.Primary)),
      row(button('admin:roleSelector:deleteGroup', '🗑️ Delete Group', ButtonStyle.Danger)),
      nav(),
    ],
  };
}

function buildColourPanel(guild, group) {
  const palette = [...group.palette].sort((a, b) => a.order - b.order).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:palette').setPlaceholder('Enabled preset colours').setMinValues(0).setMaxValues(Math.max(1, palette.length)).addOptions(palette.map((x) => ({
    label: x.label, value: x.id, emoji: x.emoji || undefined, description: x.hex, default: x.enabled,
  })));
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌈 Role Selector · Groups · Colours').setDescription([
      '**Built-in group 🔒**', 'Choose preset colours and custom HEX availability.', '',
      ...palette.map((x) => `${x.enabled ? '✅' : '⬜'} ${x.emoji} **${x.label}** · \`${x.hex}\``),
    ].join('\n'))],
    components: [
      groupMenu(guild.id, group.id),
      row(menu),
      row(
        button('admin:roleSelector:toggleHex', group.customHexEnabled ? '🎨 Custom HEX: On' : '🎨 Custom HEX: Off'),
        button('admin:roleSelector:colourClearToggle', group.allowRemove ? '🧹 Allow Clear: Yes' : '🧹 Allow Clear: No'),
      ),
      nav(),
    ],
  };
}

function buildGroupSettings(i) {
  const group = roleSelector.getGroup(i.guildId, state(i).groupId);
  if (!group || group.builtIn) throw new Error('Select a custom group first.');
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`⚙️ ${group.emoji || '🏷️'} ${group.name} · Group Settings`).setDescription([
      `**Selection type:** ${group.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'}`,
      `**Allow members to clear selection:** ${group.allowRemove ? 'Yes ✅' : 'No'}`,
    ].join('\n'))],
    components: [
      row(
        button('admin:roleSelector:toggleMode', group.selectionMode === 'multiple' ? '☑️ Multiple Choices' : '1️⃣ Single Choice', ButtonStyle.Primary),
        button('admin:roleSelector:toggleRemove', group.allowRemove ? '🧹 Allow Clear: Yes' : '🧹 Allow Clear: No'),
      ),
      nav('admin:roleSelector:groups'),
    ],
  };
}

function buildAppearance(guild) {
  const section = roleSelector.getSection(guild.id);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Role Selector · Appearance').setDescription([
      '**Role Style**',
      `Format: \`${roleSelector.roleNameFor(section, 'Example Role')}\``,
      `Detected suggestion: ${section.style.detectedFormat ? `\`${section.style.detectedFormat}\`` : '`Not scanned`'}`, '',
      '**Role Placement**',
      `Anchor: ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}>` : '`Not set`'}`,
      `Placement: **${section.style.placement}**`,
      `Keep roles together: **${section.style.keepGrouped ? 'Yes ✅' : 'No'}**`,
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
        button('admin:roleSelector:toggleGrouped', section.style.keepGrouped ? '🧲 Keep Together: On' : '🧲 Keep Together: Off'),
      ),
      section.style.detectedFormat ? row(button('admin:roleSelector:applyStyle', '✅ Apply Suggestion', ButtonStyle.Success)) : null,
      nav(),
    ].filter(Boolean),
  };
}

function deploymentSelect(guildId, selectedId = null) {
  const list = deploymentList(roleSelector.getSection(guildId)).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentSelect').setPlaceholder(list.length ? 'Choose a deployed panel' : 'No deployments yet').setMinValues(1).setMaxValues(1);
  if (!list.length) return row(menu.setDisabled(true).addOptions({ label: 'No deployments yet', value: '__none__' }));
  menu.addOptions(list.map((d, index) => ({
    label: `Panel ${index + 1}${d.status === 'retired' ? ' · Retired' : ''}`.slice(0, 100),
    value: d.id,
    description: `${d.channelId ? 'Channel selected' : 'No channel'} · ${d.groupIds.length} group(s)`.slice(0, 100),
    default: d.id === selectedId,
  })));
  return row(menu);
}

function deploymentGroupFilterMenu(guildId, deployment) {
  const selectedGroup = stateForDeploymentContentGroup(deployment, guildId);
  const included = deployment.groupIds.map((id) => roleSelector.getGroup(guildId, id)).filter((g) => g && g.type !== 'colour' && (g.options || []).some((x) => x.enabled)).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentContentGroup').setPlaceholder('Choose a group to limit roles').setMinValues(1).setMaxValues(1);
  if (!included.length) return row(menu.setDisabled(true).addOptions({ label: 'No role groups selected', value: '__none__' }));
  menu.addOptions(included.map((g) => ({
    label: `${g.emoji || '🏷️'} ${g.name}`.slice(0, 100),
    value: g.id,
    description: Array.isArray(deployment.optionIdsByGroup?.[g.id]) ? `${deployment.optionIdsByGroup[g.id].length} selected role(s)` : 'All roles included',
    default: g.id === selectedGroup,
  })));
  return row(menu);
}

function stateForDeploymentContentGroup(deployment, guildId) {
  const values = Object.keys(deployment.optionIdsByGroup || {});
  return values.find((id) => deployment.groupIds.includes(id) && roleSelector.getGroup(guildId, id)) || null;
}

function deploymentOptionMenu(guildId, deployment, groupId) {
  const group = roleSelector.getGroup(guildId, groupId);
  const options = (group?.options || []).filter((x) => x.enabled).slice(0, 25);
  const selected = deployment.optionIdsByGroup?.[groupId];
  const selectedSet = Array.isArray(selected) ? new Set(selected) : new Set(options.map((x) => x.id));
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentOptions').setPlaceholder('Choose roles shown on this panel').setMinValues(0).setMaxValues(Math.max(1, options.length));
  if (!options.length) return row(menu.setDisabled(true).addOptions({ label: 'No role options available', value: '__none__' }));
  menu.addOptions(options.map((x) => ({
    label: `${x.emoji || '•'} ${x.label}`.slice(0, 100),
    value: x.id,
    description: (x.description || 'Role selector option').slice(0, 100),
    default: selectedSet.has(x.id),
  })));
  return row(menu);
}

async function buildDeploymentsPanel(i) {
  const list = deploymentList(roleSelector.getSection(i.guildId));
  const current = state(i);
  const selected = current.deploymentId ? list.find((d) => d.id === current.deploymentId) : null;
  if (!selected) {
    const lines = await Promise.all(list.map(async (d, index) => {
      const { message } = await fetchDeployment(i.guild, d);
      const names = d.groupIds.map((id) => roleSelector.getGroup(i.guildId, id)?.name).filter(Boolean);
      return `**${index + 1}.** ${d.channelId ? `<#${d.channelId}>` : '`No channel`'} · ${d.status === 'retired' ? 'Retired 📦' : message ? 'Deployed ✅' : 'Not deployed ⚠️'}\n${names.length ? names.join(' · ') : 'No groups selected'}`;
    }));
    return {
      content: null,
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📍 Role Selector · Deployments').setDescription([
        'Deploy different Role Selector panels to different channels. The same group can appear on multiple panels.', '',
        lines.join('\n\n') || '`No deployments yet`',
      ].join('\n').slice(0, 4096))],
      components: [
        deploymentSelect(i.guildId),
        row(button('admin:roleSelector:deploymentCreate', '➕ Create Deployment', ButtonStyle.Success)),
        nav(),
      ],
    };
  }

  const { message } = await fetchDeployment(i.guild, selected);
  const names = selected.groupIds.map((id) => roleSelector.getGroup(i.guildId, id)?.name).filter(Boolean);
  const jump = message ? `https://discord.com/channels/${i.guildId}/${message.channel.id}/${message.id}` : null;
  const channelName = selected.channelId ? i.guild.channels.cache.get(selected.channelId)?.name : null;
  const channelMenu = new ChannelSelectMenuBuilder().setCustomId('admin:roleSelector:deploymentChannel').setPlaceholder(channelName ? `Current: #${channelName} · choose to change` : 'Choose deployment channel').setMinValues(1).setMaxValues(1).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  return {
    content: null,
    embeds: [new EmbedBuilder().setColor(selected.status === 'retired' ? 0x747F8D : 0x5865F2).setTitle('📍 Role Selector · Manage Deployment').setDescription([
      `**Channel:** ${selected.channelId ? `<#${selected.channelId}>` : '`Not selected`'}`,
      `**Message:** ${message ? 'Deployed ✅' : selected.status === 'retired' ? 'Retired 📦' : 'Not deployed'}`,
      `**Groups:** ${names.length ? names.join(' · ') : '`None selected`'}`, '',
      'Choose the destination and open **Groups & Roles** to control exactly what this panel exposes.',
    ].join('\n'))],
    components: [
      deploymentSelect(i.guildId, selected.id),
      row(channelMenu),
      row(button('admin:roleSelector:deploymentContent', '🏷️ Groups & Roles', ButtonStyle.Primary)),
      row(
        button('admin:roleSelector:deploy', message ? '🔄 Update Panel' : '📨 Deploy Panel', ButtonStyle.Success, !selected.channelId || !selected.groupIds.length),
        jump ? linkButton('↗️ Jump to Panel', jump) : null,
        button('admin:roleSelector:deploymentRetire', '📦 Retire', ButtonStyle.Secondary, !message),
        button('admin:roleSelector:deploymentDelete', '🗑️ Delete', ButtonStyle.Danger),
      ),
      nav('admin:roleSelector:deployment'),
    ],
  };
}

async function buildDeploymentContentPanel(i) {
  const deployment = deploymentById(i.guildId, state(i).deploymentId);
  if (!deployment) throw new Error('Choose a deployment first.');
  const current = state(i);
  if (current.deploymentContentGroupId && !deployment.groupIds.includes(current.deploymentContentGroupId)) current.deploymentContentGroupId = null;
  const groupId = current.deploymentContentGroupId;
  const group = groupId ? roleSelector.getGroup(i.guildId, groupId) : null;
  const roleLimitText = Object.entries(deployment.optionIdsByGroup || {}).filter(([id]) => deployment.groupIds.includes(id)).map(([id, ids]) => {
    const g = roleSelector.getGroup(i.guildId, id);
    return g ? `• ${g.name}: ${ids.length} selected role(s)` : null;
  }).filter(Boolean);
  return {
    content: null,
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Deployment Content').setDescription([
      'Select the groups shown on this panel. For a standard group, you can optionally limit the panel to specific role options.', '',
      `**Groups selected:** ${deployment.groupIds.length}`,
      roleLimitText.length ? `**Role filters:**\n${roleLimitText.join('\n')}` : '**Role filters:** All roles from each selected group',
      group ? `\nEditing roles for **${group.name}**.` : '',
    ].join('\n').slice(0, 4096))],
    components: [
      groupMenu(i.guildId, null, 'admin:roleSelector:deploymentGroups', true, deployment.groupIds),
      deploymentGroupFilterMenu(i.guildId, deployment),
      groupId ? deploymentOptionMenu(i.guildId, deployment, groupId) : row(button('admin:roleSelector:deploymentContentHint', 'Select a group above to limit its roles', ButtonStyle.Secondary, true)),
      row(button('admin:roleSelector:deploymentOptionsAll', '♻️ Use All Roles for Group', ButtonStyle.Secondary, !groupId)),
      nav('admin:roleSelector:deploymentSelectCurrent'),
    ],
  };
}

async function deploySelected(i) {
  return withDeploymentLock(i.guildId, async () => {
    const list = deploymentList(roleSelector.getSection(i.guildId));
    const index = list.findIndex((d) => d.id === state(i).deploymentId);
    if (index < 0) throw new Error('Choose a deployment first.');
    const deployment = list[index];
    if (!deployment.channelId || !deployment.groupIds.length) throw new Error('Choose a channel and at least one group.');
    const channel = i.guild.channels.cache.get(deployment.channelId) || await i.guild.channels.fetch(deployment.channelId).catch(() => null);
    if (!channel?.send) throw new Error('Choose a sendable text channel.');
    let message = deployment.messageId ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
    if (message && !owned(i.guild, message)) message = null;
    message = message ? await message.edit(await deploymentPayload(i.guild, deployment)) : await channel.send(await deploymentPayload(i.guild, deployment));
    list[index] = { ...deployment, messageId: message.id, status: 'active' };
    saveDeployments(i.guildId, list, { actorId: i.user.id, action: 'role_selector_deploy' });
    return message;
  });
}

async function deleteSelectedDeployment(i) {
  return withDeploymentLock(i.guildId, async () => {
    const list = deploymentList(roleSelector.getSection(i.guildId));
    const index = list.findIndex((d) => d.id === state(i).deploymentId);
    if (index < 0) throw new Error('Choose a deployment first.');
    const deployment = list[index];
    const { message } = await fetchDeployment(i.guild, deployment);
    if (message) {
      if (!owned(i.guild, message)) throw new Error('Goliath will not delete a message it does not own.');
      await message.delete();
    }
    list.splice(index, 1);
    saveDeployments(i.guildId, list, { actorId: i.user.id, action: 'role_selector_deployment_delete' });
    state(i).deploymentId = null;
    state(i).deploymentContentGroupId = null;
  });
}

async function retireSelectedDeployment(i) {
  const list = deploymentList(roleSelector.getSection(i.guildId));
  const index = list.findIndex((d) => d.id === state(i).deploymentId);
  if (index < 0) throw new Error('Choose a deployment first.');
  const deployment = list[index];
  await retireDeployment(i.guild, deployment);
  list[index] = { ...deployment, status: 'retired' };
  saveDeployments(i.guildId, list, { actorId: i.user.id, action: 'role_selector_deployment_retire' });
}

function statsDeploymentRecord(section) {
  const value = section?.statsDeployment && typeof section.statsDeployment === 'object' ? section.statsDeployment : {};
  return { channelId: cleanId(value.channelId), messageId: cleanId(value.messageId) };
}

async function buildStats(guild) {
  const usage = await roleSelector.getUsage(guild);
  const rows = [];
  for (const group of usage.groups || []) for (const item of group.rows || []) rows.push({ ...item, groupId: group.id, groupName: group.name, groupEmoji: group.emoji || '🏷️' });
  rows.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const total = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector · Stats').setDescription([
      `**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,
      `**Total selections:** ${total}`, '', '**🏆 Most Selected**',
      rows.filter((x) => x.count).slice(0, 10).map((x, index) => `${index + 1}. ${x.groupEmoji} **${x.label}** — ${x.count} · ${x.groupName}`).join('\n') || '`No selections yet`',
    ].join('\n'))],
    components: [
      groupMenu(guild.id, null, 'admin:roleSelector:statsGroup'),
      row(button('admin:roleSelector:statsPublic', '📣 Public Stats Panel', ButtonStyle.Primary)),
      nav('admin:roleSelector:settings', true),
    ],
  };
}

async function buildPublicStatsPayload(guild) {
  const usage = await roleSelector.getUsage(guild);
  const rows = [];
  for (const group of usage.groups || []) for (const item of group.rows || []) rows.push({ ...item, groupName: group.name, groupEmoji: group.emoji || '🏷️' });
  rows.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  return resolvePayload(guild, {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector Leaderboard').setDescription([
      `👥 **Members using selectors:** ${usage.totalUsing}`,
      `🎯 **Total selections:** ${rows.reduce((sum, item) => sum + Number(item.count || 0), 0)}`, '',
      '**🏆 Top Choices**',
      rows.filter((x) => Number(x.count || 0) > 0).slice(0, 10).map((x, index) => `${index + 1}. ${x.groupEmoji} **${x.label}** — ${x.count}`).join('\n') || '`No selections yet`',
    ].join('\n'))],
    components: [],
  });
}

async function syncStatsDeploymentState(guild) {
  const deployment = statsDeploymentRecord(roleSelector.getSection(guild.id));
  const { message } = await fetchDeployment(guild, deployment);
  if (!message || !owned(guild, message)) return { updated: false };
  await message.edit(await buildPublicStatsPayload(guild));
  return { updated: true };
}

async function buildStatsDeploymentPanel(i) {
  const deployment = statsDeploymentRecord(roleSelector.getSection(i.guildId));
  const { message } = await fetchDeployment(i.guild, deployment);
  const channelName = deployment.channelId ? i.guild.channels.cache.get(deployment.channelId)?.name : null;
  const menu = new ChannelSelectMenuBuilder().setCustomId('admin:roleSelector:statsDeploymentChannel').setPlaceholder(channelName ? `Current: #${channelName} · choose to change` : 'Choose public stats channel').setMinValues(1).setMaxValues(1).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const jump = message ? `https://discord.com/channels/${i.guildId}/${message.channel.id}/${message.id}` : null;
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📣 Role Selector · Public Stats Panel').setDescription([
      `**Channel:** ${deployment.channelId ? `<#${deployment.channelId}>` : '`Not selected`'}`,
      `**Message:** ${message ? 'Deployed ✅' : 'Not deployed'}`, '',
      'Deploy a user-visible community leaderboard. Counts update in place; member names remain admin-only.',
    ].join('\n'))],
    components: [
      row(menu),
      row(button('admin:roleSelector:statsDeploy', message ? '🔄 Update Public Panel' : '📨 Deploy Public Panel', ButtonStyle.Success, !deployment.channelId), jump ? linkButton('↗️ Jump to Panel', jump) : null),
      nav('admin:roleSelector:stats', true),
    ],
  };
}

async function deployStats(i) {
  const deployment = statsDeploymentRecord(roleSelector.getSection(i.guildId));
  const channel = i.guild.channels.cache.get(deployment.channelId) || await i.guild.channels.fetch(deployment.channelId).catch(() => null);
  if (!channel?.send) throw new Error('Choose a sendable text channel.');
  let message = deployment.messageId ? await channel.messages.fetch(deployment.messageId).catch(() => null) : null;
  if (message && !owned(i.guild, message)) message = null;
  message = message ? await message.edit(await buildPublicStatsPayload(i.guild)) : await channel.send(await buildPublicStatsPayload(i.guild));
  roleSelector.updateSection(i.guildId, (current) => ({ ...current, statsDeployment: { channelId: channel.id, messageId: message.id } }), { actorId: i.user.id, action: 'role_selector_stats_deploy' });
  return message;
}

async function buildHealth(guild, result = null) {
  const health = result || await healthService.buildHealth(guild);
  const format = (x) => typeof x === 'string' ? x : x?.detail || x?.message || x?.code || JSON.stringify(x);
  return {
    embeds: [new EmbedBuilder().setColor(health.healthy ? 0x57F287 : 0xFAA61A).setTitle('🩺 Role Selector · Health / Repair').setDescription([
      `**Overall Health:** ${health.healthy ? 'Healthy ✅' : 'Needs Attention ⚠️'}`,
      `**Acceptance:** ${health.acceptance?.ready ? 'Ready ✅' : 'Not Ready ⚠️'}`,
      `**Managed Roles:** ${health.managedRoleCount || 0}`, '',
      '**Issues**', (health.issues || []).length ? (health.issues || []).map((x) => `• ${format(x)}`).join('\n') : '✅ No issues', '',
      '**Warnings**', (health.warnings || []).length ? (health.warnings || []).map((x) => `• ${format(x)}`).join('\n') : '✅ No warnings',
    ].join('\n').slice(0, 4096))],
    components: [row(button('admin:roleSelector:healthCheck', '🔍 Run Check', ButtonStyle.Primary), button('admin:roleSelector:healthRepair', '🛠️ Repair Safe Issues', ButtonStyle.Success)), nav('admin:roleSelector:settings', true)],
  };
}

function createGroupModal() {
  return new ModalBuilder().setCustomId('admin:roleSelector:createGroupSubmit').setTitle('Create Role Selector Group').addComponents(
    row(new TextInputBuilder().setCustomId('name').setLabel('Group name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
    row(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji / icon').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
    row(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)),
    row(new TextInputBuilder().setCustomId('mode').setLabel('Selection type: single or multiple').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setValue('single')),
  );
}
function optionsModal(group) {
  return new ModalBuilder().setCustomId('admin:roleSelector:optionsSubmit').setTitle(`Options · ${group.name}`.slice(0, 45)).addComponents(
    row(new TextInputBuilder().setCustomId('options').setLabel('emoji | label | description | roleId').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue((group.options || []).map((x) => `${x.emoji || ''} | ${x.label} | ${x.description || ''} | ${x.managed === false ? x.roleId || '' : ''}`).join('\n'))),
  );
}
function styleModal(section) {
  return new ModalBuilder().setCustomId('admin:roleSelector:styleSubmit').setTitle('Role Selector Appearance').addComponents(
    row(new TextInputBuilder().setCustomId('format').setLabel('Role format').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(section.style.format || '🎭 | {role}')),
    row(new TextInputBuilder().setCustomId('icon').setLabel('Default icon / prefix').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(section.style.icon || '')),
    row(new TextInputBuilder().setCustomId('separator').setLabel('Separator').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setValue(section.style.separator || '|')),
  );
}
function dividerModal() {
  return new ModalBuilder().setCustomId('admin:roleSelector:createDividerSubmit').setTitle('Create Role Selector Divider').addComponents(
    row(new TextInputBuilder().setCustomId('name').setLabel('Divider role name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue('🎭 | ROLE SELECTOR')),
  );
}
function hexModal(deploymentId = 'global') {
  return new ModalBuilder().setCustomId(`roleSelector:customHexSubmit:${deploymentId}`).setTitle('Pick Your Own Colour').addComponents(
    row(new TextInputBuilder().setCustomId('hex').setLabel('HEX colour').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setPlaceholder('#1EA7FF')),
    row(new TextInputBuilder().setCustomId('label').setLabel('Colour name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60)),
  );
}

async function syncPanels(guild, changedGroupId = null) {
  await Promise.allSettled([syncDeploymentState(guild, changedGroupId), syncStatsDeploymentState(guild)]);
}

async function handleRoleSelectorInteraction(i) {
  const id = String(i.customId || '');
  const actor = { actorId: i.user?.id };
  if (!id.startsWith('admin:roleSelector') && !id.startsWith('roleSelector:') && !id.startsWith('admin:colourRoles') && !id.startsWith('colourRoles:')) return false;
  try {
    if (id.startsWith('admin:')) {
      const access = await security.enforceInteractionSecurity(i, { level: 'admin', guildOnly: true });
      if (!access.allowed) return true;
    }

    if (id === 'admin:colourRoles' || id === 'admin:roleSelector' || id === 'admin:roleSelector:home') return respond(i, await buildAdminPanel(i.guild, actorName(i)));
    if (id === 'admin:roleSelector:settings') return respond(i, await buildSettingsPanel(i.guild));
    if (id === 'admin:roleSelector:enable' || id === 'admin:roleSelector:disable') {
      guildManager.setModuleEnabled(i.guildId, roleSelector.MODULE, id.endsWith(':enable'), { ...actor, action: id });
      await syncPanels(i.guild);
      return respond(i, await buildSettingsPanel(i.guild));
    }

    if (id === 'admin:roleSelector:groups') { state(i).groupId = null; return respond(i, buildGroupsPanel(i)); }
    if (id === 'admin:roleSelector:groupSelect' && i.values?.[0] !== '__none__') { state(i).groupId = i.values[0]; return respond(i, buildGroupsPanel(i)); }
    if (id === 'admin:roleSelector:createGroup') { await i.showModal(createGroupModal()); return true; }
    if (id === 'admin:roleSelector:createGroupSubmit') {
      const mode = i.fields.getTextInputValue('mode').trim().toLowerCase();
      if (!['single', 'multiple'].includes(mode)) throw new Error('Selection type must be single or multiple.');
      const group = await roleSelector.saveGroupSafe(i.guild, {
        name: i.fields.getTextInputValue('name'), emoji: i.fields.getTextInputValue('emoji'), description: i.fields.getTextInputValue('description'), selectionMode: mode, allowRemove: true, options: [],
      }, { ...actor, action: 'role_selector_create_group' });
      state(i).groupId = group.id;
      await syncPanels(i.guild, group.id);
      return i.reply({ content: `✅ Created **${group.name}**.`, ...buildGroupsPanel(i), flags: 64 });
    }
    if (id === 'admin:roleSelector:options') {
      const group = roleSelector.getGroup(i.guildId, state(i).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      await i.showModal(optionsModal(group));
      return true;
    }
    if (id === 'admin:roleSelector:optionsSubmit') {
      const group = roleSelector.getGroup(i.guildId, state(i).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      const old = new Map((group.options || []).map((x) => [x.label.toLowerCase(), x]));
      const options = i.fields.getTextInputValue('options').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 25).map((line, index) => {
        const [emoji, label, description, roleRaw] = line.split('|').map((x) => x.trim());
        if (!label) throw new Error(`Option ${index + 1} needs a label.`);
        const previous = old.get(label.toLowerCase());
        const roleId = cleanId(roleRaw);
        return { ...(previous || {}), id: previous?.id, emoji, label, description, roleId: roleId || previous?.roleId || null, managed: roleId ? false : previous?.managed !== false, enabled: true, order: (index + 1) * 10 };
      });
      await roleSelector.saveGroupSafe(i.guild, { ...group, options }, { ...actor, action: 'role_selector_update_options' });
      await syncPanels(i.guild, group.id);
      return i.reply({ content: '✅ Selector options saved.', ...buildGroupsPanel(i), flags: 64 });
    }
    if (id === 'admin:roleSelector:groupSettings') return respond(i, buildGroupSettings(i));
    if (id === 'admin:roleSelector:toggleMode' || id === 'admin:roleSelector:toggleRemove') {
      const group = roleSelector.getGroup(i.guildId, state(i).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      await roleSelector.saveGroupSafe(i.guild, { ...group, ...(id.endsWith('toggleMode') ? { selectionMode: group.selectionMode === 'multiple' ? 'single' : 'multiple' } : { allowRemove: !group.allowRemove }) }, { ...actor, action: id });
      await syncPanels(i.guild, group.id);
      return respond(i, buildGroupSettings(i));
    }
    if (id === 'admin:roleSelector:deleteGroup') {
      const group = roleSelector.getGroup(i.guildId, state(i).groupId);
      if (!group || group.builtIn) throw new Error('Select a custom group first.');
      const result = await roleSelector.deleteManagedGroupRoles(i.guild, group.id);
      if (result.unresolved) throw new Error(`Group not deleted because ${result.unresolved} managed role(s) could not be removed.`);
      roleSelector.removeGroup(i.guildId, group.id, { ...actor, action: 'role_selector_delete_group' });
      const list = deploymentList(roleSelector.getSection(i.guildId)).map((d) => {
        const optionIdsByGroup = { ...d.optionIdsByGroup }; delete optionIdsByGroup[group.id];
        return { ...d, groupIds: d.groupIds.filter((x) => x !== group.id), optionIdsByGroup };
      });
      saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_prune_deployments' });
      state(i).groupId = null;
      await syncPanels(i.guild);
      return respond(i, buildGroupsPanel(i));
    }
    if (id === 'admin:roleSelector:palette' || id === 'admin:roleSelector:toggleHex' || id === 'admin:roleSelector:colourClearToggle') {
      const group = roleSelector.getGroup(i.guildId, roleSelector.COLOUR_GROUP_ID);
      let next = group;
      if (id.endsWith(':palette')) { const selected = new Set(i.values || []); next = { ...group, palette: group.palette.map((x) => ({ ...x, enabled: selected.has(x.id) })) }; }
      else if (id.endsWith(':toggleHex')) next = { ...group, customHexEnabled: !group.customHexEnabled };
      else next = { ...group, allowRemove: !group.allowRemove };
      await roleSelector.saveGroupSafe(i.guild, next, { ...actor, action: id });
      await syncPanels(i.guild, group.id);
      return respond(i, buildColourPanel(i.guild, roleSelector.getGroup(i.guildId, roleSelector.COLOUR_GROUP_ID)));
    }

    if (id === 'admin:roleSelector:style') return respond(i, buildAppearance(i.guild));
    if (id === 'admin:roleSelector:styleOpen') { await i.showModal(styleModal(roleSelector.getSection(i.guildId))); return true; }
    if (id === 'admin:roleSelector:styleSubmit') {
      roleSelector.updateSection(i.guildId, (section) => ({ ...section, style: { ...section.style, format: i.fields.getTextInputValue('format'), icon: i.fields.getTextInputValue('icon'), separator: i.fields.getTextInputValue('separator') || '|' } }), { ...actor, action: id });
      await roleSelector.syncManagedRoleAppearance(i.guild); await syncPanels(i.guild);
      return i.reply({ content: '✅ Role appearance updated.', ...buildAppearance(i.guild), flags: 64 });
    }
    if (id === 'admin:roleSelector:anchor') { await roleSelector.setAnchorRole(i.guild, i.values?.[0] || null, { managed: false, meta: { ...actor, action: id } }); return respond(i, buildAppearance(i.guild)); }
    if (id === 'admin:roleSelector:togglePlacement' || id === 'admin:roleSelector:toggleGrouped') {
      roleSelector.updateSection(i.guildId, (section) => ({ ...section, style: { ...section.style, ...(id.endsWith('togglePlacement') ? { placement: section.style.placement === 'above' ? 'below' : 'above' } : { keepGrouped: !section.style.keepGrouped }) } }), { ...actor, action: id });
      await roleSelector.syncManagedRoleHierarchy(i.guild); await syncPanels(i.guild); return respond(i, buildAppearance(i.guild));
    }
    if (id === 'admin:roleSelector:scanStyle') {
      const suggestion = roleSelector.suggestRoleStyle(i.guild);
      roleSelector.updateSection(i.guildId, (section) => ({ ...section, style: { ...section.style, detectedFormat: suggestion.format, detectedIcon: suggestion.icon, detectedSeparator: suggestion.separator, detectedConfidence: suggestion.confidence } }), { ...actor, action: id });
      return respond(i, buildAppearance(i.guild));
    }
    if (id === 'admin:roleSelector:applyStyle') {
      roleSelector.updateSection(i.guildId, (section) => ({ ...section, style: { ...section.style, format: section.style.detectedFormat || section.style.format, icon: section.style.detectedIcon || '', separator: section.style.detectedSeparator || section.style.separator } }), { ...actor, action: id });
      await roleSelector.syncManagedRoleAppearance(i.guild); await syncPanels(i.guild); return respond(i, buildAppearance(i.guild));
    }
    if (id === 'admin:roleSelector:createDivider') { await i.showModal(dividerModal()); return true; }
    if (id === 'admin:roleSelector:createDividerSubmit') {
      const divider = await i.guild.roles.create({ name: i.fields.getTextInputValue('name').trim().slice(0, 100), permissions: [], hoist: false, mentionable: false, reason: 'Goliath Role Selector divider' });
      await roleSelector.setAnchorRole(i.guild, divider.id, { managed: true, meta: { ...actor, action: id } });
      return i.reply({ content: `✅ Created divider **${divider.name}**.`, ...buildAppearance(i.guild), flags: 64 });
    }

    if (id === 'admin:roleSelector:deployment') { state(i).deploymentId = null; state(i).deploymentContentGroupId = null; return respond(i, await buildDeploymentsPanel(i)); }
    if (id === 'admin:roleSelector:deploymentSelect' && i.values?.[0] !== '__none__') { state(i).deploymentId = i.values[0]; state(i).deploymentContentGroupId = null; return respond(i, await buildDeploymentsPanel(i)); }
    if (id === 'admin:roleSelector:deploymentSelectCurrent') return respond(i, await buildDeploymentsPanel(i));
    if (id === 'admin:roleSelector:deploymentCreate') {
      const list = deploymentList(roleSelector.getSection(i.guildId));
      const deployment = normalizeDeployment({ id: `panel-${Date.now().toString(36)}`, groupIds: [] });
      list.push(deployment); saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_deployment_create' });
      state(i).deploymentId = deployment.id; state(i).deploymentContentGroupId = null;
      return respond(i, await buildDeploymentsPanel(i));
    }
    if (id === 'admin:roleSelector:deploymentContent') { state(i).deploymentContentGroupId = null; return respond(i, await buildDeploymentContentPanel(i)); }
    if (id === 'admin:roleSelector:deploymentGroups') {
      const list = deploymentList(roleSelector.getSection(i.guildId)); const index = list.findIndex((d) => d.id === state(i).deploymentId);
      if (index < 0) throw new Error('Choose a deployment first.');
      const selected = [...new Set((i.values || []).filter((x) => x !== '__none__'))];
      const optionIdsByGroup = { ...list[index].optionIdsByGroup };
      for (const groupId of Object.keys(optionIdsByGroup)) if (!selected.includes(groupId)) delete optionIdsByGroup[groupId];
      list[index] = { ...list[index], groupIds: selected, optionIdsByGroup };
      saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_deployment_groups' });
      if (state(i).deploymentContentGroupId && !selected.includes(state(i).deploymentContentGroupId)) state(i).deploymentContentGroupId = null;
      await syncOneDeployment(i.guild, list[index]).catch(() => null);
      return respond(i, await buildDeploymentContentPanel(i));
    }
    if (id === 'admin:roleSelector:deploymentContentGroup' && i.values?.[0] !== '__none__') { state(i).deploymentContentGroupId = i.values[0]; return respond(i, await buildDeploymentContentPanel(i)); }
    if (id === 'admin:roleSelector:deploymentOptions') {
      const list = deploymentList(roleSelector.getSection(i.guildId)); const index = list.findIndex((d) => d.id === state(i).deploymentId); const groupId = state(i).deploymentContentGroupId;
      if (index < 0 || !groupId) throw new Error('Choose a deployment group first.');
      list[index] = { ...list[index], optionIdsByGroup: { ...list[index].optionIdsByGroup, [groupId]: [...new Set((i.values || []).filter((x) => x !== '__none__'))] } };
      saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_deployment_options' });
      await syncOneDeployment(i.guild, list[index]).catch(() => null);
      return respond(i, await buildDeploymentContentPanel(i));
    }
    if (id === 'admin:roleSelector:deploymentOptionsAll') {
      const list = deploymentList(roleSelector.getSection(i.guildId)); const index = list.findIndex((d) => d.id === state(i).deploymentId); const groupId = state(i).deploymentContentGroupId;
      if (index < 0 || !groupId) throw new Error('Choose a deployment group first.');
      const optionIdsByGroup = { ...list[index].optionIdsByGroup }; delete optionIdsByGroup[groupId];
      list[index] = { ...list[index], optionIdsByGroup };
      saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_deployment_options_all' });
      await syncOneDeployment(i.guild, list[index]).catch(() => null);
      return respond(i, await buildDeploymentContentPanel(i));
    }
    if (id === 'admin:roleSelector:deploymentChannel') {
      const target = i.values?.[0]; if (!target) throw new Error('Choose a deployment channel.');
      const list = deploymentList(roleSelector.getSection(i.guildId)); const index = list.findIndex((d) => d.id === state(i).deploymentId);
      if (index < 0) throw new Error('Choose a deployment first.');
      const deployment = list[index];
      if (deployment.messageId && deployment.channelId && deployment.channelId !== target) {
        state(i).pendingChannelId = target;
        return respond(i, {
          embeds: [new EmbedBuilder().setColor(0xFAA61A).setTitle('📍 Move this Role Selector panel?').setDescription(`Current: <#${deployment.channelId}>\nNew: <#${target}>\n\nChoose what to do with the old Goliath-owned panel.`)],
          components: [
            row(button('admin:roleSelector:moveRemove', '🗑️ Remove Old Panel & Move', ButtonStyle.Danger), button('admin:roleSelector:moveRetire', '📦 Retire Old Panel & Move', ButtonStyle.Primary)),
            row(button('admin:roleSelector:moveCancel', '⬅️ Back')),
          ],
        });
      }
      list[index] = { ...deployment, channelId: target, messageId: deployment.channelId === target ? deployment.messageId : null };
      saveDeployments(i.guildId, list, { ...actor, action: 'role_selector_deployment_channel' });
      return respond(i, await buildDeploymentsPanel(i));
    }
    if (id === 'admin:roleSelector:moveCancel') { state(i).pendingChannelId = null; return respond(i, await buildDeploymentsPanel(i)); }
    if (id === 'admin:roleSelector:moveRemove' || id === 'admin:roleSelector:moveRetire') {
      const list = deploymentList(roleSelector.getSection(i.guildId)); const index = list.findIndex((d) => d.id === state(i).deploymentId);
      if (index < 0) throw new Error('Choose a deployment first.');
      const deployment = list[index]; const { message } = await fetchDeployment(i.guild, deployment);
      if (message) {
        if (!owned(i.guild, message)) throw new Error('Goliath will not modify a message it does not own.');
        if (id.endsWith('moveRemove')) await message.delete(); else await message.edit(memberDisabledPayload());
      }
      list[index] = { ...deployment, channelId: state(i).pendingChannelId, messageId: null, status: 'active' };
      state(i).pendingChannelId = null; saveDeployments(i.guildId, list, { ...actor, action: id });
      const sent = await deploySelected(i); const payload = await buildDeploymentsPanel(i); payload.content = `✅ Panel moved to <#${sent.channel.id}>.`; return respond(i, payload);
    }
    if (id === 'admin:roleSelector:deploy') { const message = await deploySelected(i); const payload = await buildDeploymentsPanel(i); payload.content = `✅ Role Selector panel deployed in <#${message.channel.id}>.`; return respond(i, payload); }
    if (id === 'admin:roleSelector:deploymentRetire') { await retireSelectedDeployment(i); return respond(i, await buildDeploymentsPanel(i)); }
    if (id === 'admin:roleSelector:deploymentDelete') { await deleteSelectedDeployment(i); return respond(i, await buildDeploymentsPanel(i)); }

    if (id === 'admin:roleSelector:stats') return respond(i, await buildStats(i.guild));
    if (id === 'admin:roleSelector:statsGroup' && i.values?.[0] !== '__none__') {
      const usage = await roleSelector.getUsage(i.guild, i.values[0]); const group = usage.groups?.[0];
      return respond(i, { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${group?.emoji || '🏷️'} ${group?.name || 'Group'}`).setDescription((group?.rows || []).map((x, index) => `${index + 1}. **${x.label}** — ${x.count || 0}`).join('\n') || '`No selections yet`')], components: [nav('admin:roleSelector:stats', true)] });
    }
    if (id === 'admin:roleSelector:statsPublic') return respond(i, await buildStatsDeploymentPanel(i));
    if (id === 'admin:roleSelector:statsDeploymentChannel') {
      const target = i.values?.[0]; if (!target) throw new Error('Choose a public stats channel.');
      const current = statsDeploymentRecord(roleSelector.getSection(i.guildId));
      roleSelector.updateSection(i.guildId, (section) => ({ ...section, statsDeployment: { channelId: target, messageId: current.channelId === target ? current.messageId : null } }), { ...actor, action: 'role_selector_stats_channel' });
      return respond(i, await buildStatsDeploymentPanel(i));
    }
    if (id === 'admin:roleSelector:statsDeploy') { const message = await deployStats(i); const payload = await buildStatsDeploymentPanel(i); payload.content = `✅ Public stats panel deployed in <#${message.channel.id}>.`; return respond(i, payload); }
    if (id === 'admin:roleSelector:health' || id === 'admin:roleSelector:healthCheck') return respond(i, await buildHealth(i.guild));
    if (id === 'admin:roleSelector:healthRepair') { const health = await healthService.repair(i.guild); await syncPanels(i.guild); return respond(i, await buildHealth(i.guild, health)); }

    if (id.startsWith('roleSelector:')) roleSelector.assertModuleEnabled(i.guildId);
    if (id.startsWith('roleSelector:openGroup')) {
      if (i.values?.[0] === '__none__') return i.reply({ content: 'No selector groups are available.', flags: 64 });
      const deploymentId = id.split(':')[2] || null; const deployment = deploymentId ? deploymentById(i.guildId, deploymentId) : null; const allowed = deploymentAllowedGroups(i.guildId, deploymentId);
      return i.reply({ ...await resolvePayload(i.guild, memberGroupPayload(i.guild, await freshMember(i), i.values[0], allowed, deploymentId, deployment)), flags: 64 });
    }
    if (id.startsWith('roleSelector:switchGroup')) {
      if (i.values?.[0] === '__none__') return i.update(memberDisabledPayload());
      const deploymentId = id.split(':')[2] || null; const deployment = deploymentId ? deploymentById(i.guildId, deploymentId) : null; const allowed = deploymentAllowedGroups(i.guildId, deploymentId);
      return i.update(await resolvePayload(i.guild, memberGroupPayload(i.guild, await freshMember(i), i.values[0], allowed, deploymentId, deployment)));
    }
    if (id.startsWith('roleSelector:colourChoose:')) {
      const deploymentId = id.split(':')[2] || 'global'; const deployment = deploymentId !== 'global' ? deploymentById(i.guildId, deploymentId) : null;
      if (deployment && !deployment.groupIds.includes(roleSelector.COLOUR_GROUP_ID)) throw new Error('Colours are not available on this panel.');
      await roleSelector.applyColourSelection(i.guild, i.member, i.values[0]);
      await i.update(await resolvePayload(i.guild, memberGroupPayload(i.guild, await freshMember(i), roleSelector.COLOUR_GROUP_ID, deploymentAllowedGroups(i.guildId, deploymentId), deploymentId, deployment)));
      await syncStatsDeploymentState(i.guild).catch(() => null);
      await i.followUp({ content: '✅ Your colour has been updated.', flags: 64 }); return true;
    }
    if (id.startsWith('roleSelector:customHex:')) { await i.showModal(hexModal(id.split(':')[2] || 'global')); return true; }
    if (id.startsWith('roleSelector:customHexSubmit:')) { await roleSelector.applyColourSelection(i.guild, i.member, i.fields.getTextInputValue('hex'), i.fields.getTextInputValue('label')); await syncStatsDeploymentState(i.guild).catch(() => null); return i.reply({ content: '✅ Your custom colour has been applied.', flags: 64 }); }
    if (id.startsWith('roleSelector:choose:')) {
      const parts = id.split(':'); const groupId = parts[2]; const deploymentId = parts[3] || 'global'; const deployment = deploymentId !== 'global' ? deploymentById(i.guildId, deploymentId) : null; const allowed = deploymentAllowedGroups(i.guildId, deploymentId);
      if (allowed && !allowed.includes(groupId)) throw new Error('That group is not available on this panel.');
      const filter = optionFilterFor(deployment, groupId); if (filter && (i.values || []).some((value) => !filter.has(value))) throw new Error('That role is not available on this panel.');
      await roleSelector.applyStandardSelection(i.guild, i.member, groupId, i.values || []);
      await i.update(await resolvePayload(i.guild, memberGroupPayload(i.guild, await freshMember(i), groupId, allowed, deploymentId, deployment)));
      await syncStatsDeploymentState(i.guild).catch(() => null); await i.followUp({ content: '✅ Your role selection has been updated.', flags: 64 }); return true;
    }
    if (id.startsWith('roleSelector:clear:')) {
      const parts = id.split(':'); const groupId = parts[2]; const deploymentId = parts[3] || 'global'; const deployment = deploymentId !== 'global' ? deploymentById(i.guildId, deploymentId) : null; const allowed = deploymentAllowedGroups(i.guildId, deploymentId);
      if (allowed && !allowed.includes(groupId)) throw new Error('That group is not available on this panel.');
      await roleSelector.clearSelection(i.guild, i.member, groupId);
      await i.update(await resolvePayload(i.guild, memberGroupPayload(i.guild, await freshMember(i), groupId, allowed, deploymentId, deployment)));
      await syncStatsDeploymentState(i.guild).catch(() => null); await i.followUp({ content: '✅ Your selection has been cleared.', flags: 64 }); return true;
    }
    if (id === 'colourRoles:choose') { await roleSelector.applyColourSelection(i.guild, i.member, i.values[0]); await syncStatsDeploymentState(i.guild).catch(() => null); return i.reply({ content: '✅ Your colour has been updated.', flags: 64 }); }
    if (id === 'colourRoles:remove') { await roleSelector.clearSelection(i.guild, i.member, roleSelector.COLOUR_GROUP_ID); await syncStatsDeploymentState(i.guild).catch(() => null); return i.reply({ content: '✅ Your colour has been removed.', flags: 64 }); }
    if (id === 'colourRoles:custom') { await i.showModal(hexModal()); return true; }
    return true;
  } catch (error) {
    console.error('[RoleSelectorPanel]', error);
    const payload = { content: `❌ ${error.message || 'Role Selector failed.'}`, flags: 64 };
    if (i.deferred || i.replied) await i.followUp(payload).catch(() => null); else await i.reply(payload).catch(() => null);
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
