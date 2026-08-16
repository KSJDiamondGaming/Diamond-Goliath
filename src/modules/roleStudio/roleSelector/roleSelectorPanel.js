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
const roleSelector = require('./roleSelector');
const healthService = require('./roleSelectorHealth');

const sessions = new Map();
const row = (...items) => new ActionRowBuilder().addComponents(...items.filter(Boolean));
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const sessionKey = (interaction) => `${interaction.guildId}:${interaction.user.id}`;
const displayName = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Unknown User';

function state(interaction) {
  const current = sessions.get(sessionKey(interaction)) || { groupId: roleSelector.COLOUR_GROUP_ID, page: 'home' };
  if (!roleSelector.getGroup(interaction.guildId, current.groupId)) current.groupId = roleSelector.COLOUR_GROUP_ID;
  sessions.set(sessionKey(interaction), current);
  return current;
}
async function respond(interaction, payload, ephemeral = false) {
  if (interaction.isModalSubmit?.()) return interaction.reply({ ...payload, flags: 64 });
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (ephemeral) return interaction.reply({ ...payload, flags: 64 });
  return interaction.update(payload);
}
function enabledGroups(guildId) { return roleSelector.listGroups(guildId).filter((group) => group.enabled); }
function groupSelect(guildId, customId, selected = null, includeBuiltIn = true) {
  const groups = roleSelector.listGroups(guildId).filter((group) => includeBuiltIn || !group.builtIn).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(groups.length ? 'Select a role group' : 'No custom groups yet').setMinValues(1).setMaxValues(1).setDisabled(!groups.length);
  if (groups.length) menu.addOptions(groups.map((group) => ({ label: `${group.emoji || '🏷️'} ${group.name}`.slice(0, 100), value: group.id, description: `${group.selectionMode === 'multiple' ? 'Multiple choices' : 'One choice'}${group.builtIn ? ' · Built in' : ''}`.slice(0, 100), default: group.id === selected })));
  return row(menu);
}
function memberLauncherPayload(guild) {
  const groups = enabledGroups(guild.id).slice(0, 25);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎭 Choose Your Roles').setDescription([
    'Choose a category below, then select the roles that fit you.',
    'Each category manages only its own roles, so changing one choice never removes roles from another category.',
  ].join('\n'));
  const menu = new StringSelectMenuBuilder().setCustomId('roleSelector:openGroup').setPlaceholder('Choose a category').setMinValues(1).setMaxValues(1);
  if (groups.length) menu.addOptions(groups.map((group) => ({ label: `${group.emoji || '🏷️'} ${group.name}`.slice(0, 100), value: group.id, description: (group.description || (group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one')).slice(0, 100) })));
  else menu.setDisabled(true).addOptions({ label: 'No selectors available', value: 'none' });
  return { embeds: [embed], components: [row(menu)] };
}
function memberGroupPayload(guild, member, groupId) {
  const section = roleSelector.getSection(guild.id); const group = section.groups[groupId];
  if (!group || !group.enabled) throw new Error('That role selector is unavailable.');
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${group.emoji || '🏷️'} ${group.name}`).setDescription([group.description || 'Choose your role.', group.selectionMode === 'multiple' ? 'You can select multiple options.' : 'You can select one option.', group.allowRemove ? 'You can clear this category at any time.' : null].filter(Boolean).join('\n'));
  const components = [];
  if (group.type === 'colour') {
    const options = group.palette.filter((item) => item.enabled).sort((a, b) => a.order - b.order).slice(0, 24).map((item) => ({ label: item.label, value: item.hex, emoji: item.emoji || undefined, description: `${item.hex} · ${item.family}`.slice(0, 100) }));
    if (options.length) components.push(row(new StringSelectMenuBuilder().setCustomId('roleSelector:colourChoose').setPlaceholder('Choose a colour').setMinValues(1).setMaxValues(1).addOptions(options)));
    components.push(row(group.customHexEnabled ? button('roleSelector:customHex', '🎨 Pick Your Own', ButtonStyle.Primary) : null, group.allowRemove ? button(`roleSelector:clear:${group.id}`, '🧹 Clear Selection') : null));
  } else {
    const options = (group.options || []).filter((item) => item.enabled).sort((a, b) => a.order - b.order).slice(0, 25).map((item) => ({ label: item.label, value: item.id, emoji: item.emoji || undefined, description: item.description || undefined, default: member ? member.roles.cache.has(item.roleId) : false }));
    if (options.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`roleSelector:choose:${group.id}`).setPlaceholder(group.selectionMode === 'multiple' ? 'Choose one or more' : 'Choose one').setMinValues(group.selectionMode === 'multiple' ? 0 : 1).setMaxValues(group.selectionMode === 'multiple' ? Math.min(25, options.length) : 1).addOptions(options)));
    else embed.addFields({ name: 'No options yet', value: 'An administrator has not added choices to this category.' });
    if (group.allowRemove) components.push(row(button(`roleSelector:clear:${group.id}`, '🧹 Clear Selection')));
  }
  return { embeds: [embed], components: components.filter((r) => r.components.length) };
}

async function buildAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = roleSelector.getSection(guild.id); const enabled = guildManager.isModuleEnabled(guild.id, roleSelector.MODULE); const health = await healthService.buildHealth(guild); const usage = await roleSelector.getUsage(guild);
  const customGroups = roleSelector.listGroups(guild.id).filter((group) => !group.builtIn);
  const embed = new EmbedBuilder().setColor(!enabled ? 0x747F8D : health.healthy ? 0x57F287 : 0xFAA61A).setTitle('🎭 Role Selector').setDescription([
    'Universal self-role system with Colours built in and fully custom admin-defined categories.', '',
    `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
    `**Selector groups:** ${roleSelector.listGroups(guild.id).length} (${customGroups.length} custom)`,
    `**Members using selectors:** ${usage.totalUsing}/${usage.totalMembers}`,
    `**Managed roles:** ${health.managedRoleCount}`,
    `**Role format:** \`${roleSelector.roleNameFor(section, 'Example Role')}\``,
    `**Anchor:** ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}> (${section.style.placement})` : '`Not set`'}`,
    `**Deployed:** ${section.deployment.channelId ? `<#${section.deployment.channelId}>` : '`Not deployed`'}`,
    '', health.issues.length ? `⚠️ ${health.issues.length} health issue(s)` : '✅ Health checks passed',
  ].join('\n')).setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp();
  return { embeds: [embed], components: [
    row(button(enabled ? 'admin:roleSelector:disable' : 'admin:roleSelector:enable', enabled ? '⏸ Disable' : '▶ Enable', enabled ? ButtonStyle.Secondary : ButtonStyle.Success), button('admin:roleSelector:groups', '🏷️ Groups', ButtonStyle.Primary), button('admin:roleSelector:colours', '🌈 Colours', ButtonStyle.Primary), button('admin:roleSelector:style', '🎨 Style & Placement', ButtonStyle.Primary), button('admin:roleSelector:stats', '📊 Stats', ButtonStyle.Primary)),
    row(button('admin:roleSelector:createGroup', '➕ Add Group', ButtonStyle.Success), button('admin:roleSelector:deploy', '📨 Deploy Selector', ButtonStyle.Success), button('admin:roleSelector:scanStyle', '🔎 Scan Guild Style'), button('admin:roleSelector:health', '🩺 Health / Repair')),
    row(button('admin:studio:roleStudio', '⬅️ Back to Role Studio')),
  ] };
}
function buildGroupsPanel(interaction) {
  const s = state(interaction); const group = roleSelector.getGroup(interaction.guildId, s.groupId); const custom = roleSelector.listGroups(interaction.guildId).filter((item) => !item.builtIn);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Role Selector · Custom Groups').setDescription(custom.length ? [
    `Selected: **${group?.builtIn ? 'Choose a custom group below' : `${group?.emoji || '🏷️'} ${group?.name}` }**`,
    !group?.builtIn ? `Mode: **${group.selectionMode === 'multiple' ? 'Multiple choices' : 'Single choice'}** · Options: **${group.options?.length || 0}** · Remove allowed: **${group.allowRemove ? 'Yes' : 'No'}**` : null,
    !group?.builtIn && group.options?.length ? '', ...(group.options || []).map((option) => `${option.enabled ? '✅' : '⬜'} ${option.emoji || '•'} **${option.label}**${option.roleId ? ` · <@&${option.roleId}>` : ' · role created on first use'}`) : null,
  ].filter(Boolean).flat().join('\n').slice(0, 4096) : 'No custom selector groups exist yet. Create one for platforms, regions, interests, notifications, games, pronouns, or anything else your server needs.');
  return { embeds: [embed], components: [groupSelect(interaction.guildId, 'admin:roleSelector:groupSelect', s.groupId, false), row(button('admin:roleSelector:createGroup', '➕ Add Group', ButtonStyle.Success), button('admin:roleSelector:addOptions', '➕ Add / Replace Options', ButtonStyle.Primary, !group || group.builtIn), button('admin:roleSelector:toggleMode', group?.selectionMode === 'multiple' ? '☑️ Multiple' : '1️⃣ Single', ButtonStyle.Primary, !group || group.builtIn), button('admin:roleSelector:toggleRemove', group?.allowRemove ? '🧹 Clear On' : '🧹 Clear Off', ButtonStyle.Secondary, !group || group.builtIn)), row(button('admin:roleSelector:deleteGroup', '🗑️ Delete Group', ButtonStyle.Danger, !group || group.builtIn), button('admin:roleSelector', '⬅️ Back'))] };
}
function buildColoursPanel(guild) {
  const group = roleSelector.getGroup(guild.id, roleSelector.COLOUR_GROUP_ID);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:roleSelector:palette').setPlaceholder('Enabled default colours').setMinValues(1).setMaxValues(group.palette.length).addOptions(group.palette.sort((a, b) => a.order - b.order).map((item) => ({ label: item.label, value: item.id, emoji: item.emoji || undefined, description: item.hex, default: item.enabled })));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌈 Role Selector · Colours').setDescription(['Colours remain Goliath’s built-in special selector.', 'Default colours keep rainbow order. Custom HEX colours are classified into their nearest colour family for hierarchy placement.', '', ...group.palette.sort((a, b) => a.order - b.order).map((item) => `${item.enabled ? '✅' : '⬜'} ${item.emoji} **${item.label}** · \`${item.hex}\``), '', `**Custom HEX:** ${group.customHexEnabled ? 'Enabled ✅' : 'Disabled'}`].join('\n'))], components: [row(menu), row(button('admin:roleSelector:toggleHex', group.customHexEnabled ? '🎨 Custom HEX On' : '🎨 Custom HEX Off', group.customHexEnabled ? ButtonStyle.Success : ButtonStyle.Secondary), button('admin:roleSelector', '⬅️ Back'))] };
}
function buildStylePanel(guild) {
  const section = roleSelector.getSection(guild.id); return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Role Selector · Style & Placement').setDescription([`**Format:** \`${roleSelector.roleNameFor(section, 'Example Role')}\``, `**Anchor:** ${section.style.anchorRoleId ? `<@&${section.style.anchorRoleId}>` : '`Not set`'}`, `**Placement:** ${section.style.placement}`, `**Keep grouped:** ${section.style.keepGrouped ? 'Yes ✅' : 'No'}`, section.style.detectedFormat ? `**Detected suggestion:** \`${section.style.detectedFormat}\`` : '**Detected suggestion:** `Not scanned`', '', 'Role Selector only repositions roles it owns. Existing guild roles keep their relative order.'].join('\n'))], components: [row(new RoleSelectMenuBuilder().setCustomId('admin:roleSelector:anchor').setPlaceholder('Divider / anchor role').setMinValues(0).setMaxValues(1)), row(button('admin:roleSelector:styleModalOpen', '✏️ Edit Role Format', ButtonStyle.Primary), button('admin:roleSelector:togglePlacement', section.style.placement === 'above' ? '⬆️ Above' : '⬇️ Below', ButtonStyle.Primary), button('admin:roleSelector:toggleGrouped', section.style.keepGrouped ? '🧲 Grouping On' : '🧲 Grouping Off', section.style.keepGrouped ? ButtonStyle.Success : ButtonStyle.Secondary), section.style.detectedFormat ? button('admin:roleSelector:applyStyle', '✅ Apply Suggestion', ButtonStyle.Success) : null), row(button('admin:roleSelector', '⬅️ Back'))] };
}
async function buildStatsPanel(guild) {
  const usage = await roleSelector.getUsage(guild); const fields = usage.groups.slice(0, 10).map((group) => ({ name: `${group.emoji || '🏷️'} ${group.name}`, value: group.rows.length ? group.rows.slice(0, 8).map((item, i) => `${i + 1}. **${item.label}** — ${item.count}`).join('\n') : '`No selections yet`', inline: false }));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📊 Role Selector · Stats').setDescription(`Members using at least one selector: **${usage.totalUsing}/${usage.totalMembers}**`).addFields(fields)], components: [groupSelect(guild.id, 'admin:roleSelector:statsGroup'), row(button('admin:roleSelector', '⬅️ Back'))] };
}
async function buildGroupStats(guild, groupId) {
  const usage = await roleSelector.getUsage(guild, groupId); const group = usage.groups[0];
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📊 ${group?.emoji || '🏷️'} ${group?.name || 'Selector'}`).setDescription(group?.rows?.length ? group.rows.map((item, i) => [`${i + 1}. **${item.label}** — ${item.count}`, item.members.length ? item.members.slice(0, 30).map((member) => `<@${member.id}>`).join(', ') : '`Nobody selected this`'].join('\n')).join('\n\n').slice(0, 4096) : '`No selections yet.`')], components: [row(button('admin:roleSelector:stats', '⬅️ Back to Stats'))] };
}

function groupModal() { return new ModalBuilder().setCustomId('admin:roleSelector:createGroupSubmit').setTitle('Create Role Selector Group').addComponents(row(new TextInputBuilder().setCustomId('name').setLabel('Group name').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setPlaceholder('Gaming Platform')), row(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji / icon (optional)').setStyle(TextInputStyle.Short).setMaxLength(16).setRequired(false).setPlaceholder('🎮')), row(new TextInputBuilder().setCustomId('description').setLabel('Description (optional)').setStyle(TextInputStyle.Paragraph).setMaxLength(200).setRequired(false).setPlaceholder('Choose the platforms you use.')), row(new TextInputBuilder().setCustomId('mode').setLabel('Selection mode: single or multiple').setStyle(TextInputStyle.Short).setRequired(true).setValue('single'))); }
function optionsModal(group) { return new ModalBuilder().setCustomId('admin:roleSelector:addOptionsSubmit').setTitle(`Options · ${group.name}`.slice(0, 45)).addComponents(row(new TextInputBuilder().setCustomId('options').setLabel('emoji | label | description').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue((group.options || []).map((item) => `${item.emoji || ''} | ${item.label} | ${item.description || ''}`).join('\n')).setPlaceholder('🎮 | Xbox | Xbox players\n🕹️ | PlayStation | PlayStation players\n💻 | PC | PC players'))); }
function styleModal(section) { return new ModalBuilder().setCustomId('admin:roleSelector:styleSubmit').setTitle('Role Selector Style').addComponents(row(new TextInputBuilder().setCustomId('format').setLabel('Role format').setStyle(TextInputStyle.Short).setRequired(true).setValue(section.style.format || '🎭 | {role}').setPlaceholder('♥️ | {role}')), row(new TextInputBuilder().setCustomId('icon').setLabel('Default icon / prefix').setStyle(TextInputStyle.Short).setRequired(false).setValue(section.style.icon || '')), row(new TextInputBuilder().setCustomId('separator').setLabel('Separator').setStyle(TextInputStyle.Short).setRequired(false).setValue(section.style.separator || '|'))); }
function hexModal() { return new ModalBuilder().setCustomId('roleSelector:customHexSubmit').setTitle('Pick Your Own Colour').addComponents(row(new TextInputBuilder().setCustomId('hex').setLabel('HEX colour').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('#1EA7FF')), row(new TextInputBuilder().setCustomId('label').setLabel('Colour name (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Sky Blue'))); }

async function deploySelector(interaction) {
  const section = roleSelector.getSection(interaction.guild.id); const channelId = section.deployment.channelId || interaction.channelId; const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null); if (!channel?.send) throw new Error('Choose a text channel or run this from a sendable channel.');
  let message = section.deployment.messageId ? await channel.messages.fetch(section.deployment.messageId).catch(() => null) : null; const payload = memberLauncherPayload(interaction.guild);
  if (message) await message.edit(payload); else message = await channel.send(payload);
  roleSelector.updateSection(interaction.guild.id, (current) => ({ ...current, deployment: { channelId: channel.id, messageId: message.id } }), { actorId: interaction.user.id, action: 'role_selector_deploy' }); return message;
}

async function handleRoleSelectorInteraction(interaction) {
  const id = String(interaction.customId || ''); const actor = { actorId: interaction.user?.id };
  if (!id.startsWith('admin:roleSelector') && !id.startsWith('roleSelector:') && !id.startsWith('admin:colourRoles') && !id.startsWith('colourRoles:')) return false;
  try {
    // Legacy Colour Roles entry points are redirected into the new module during migration.
    if (id === 'admin:colourRoles') return respond(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:roleSelector' || id === 'admin:roleSelector:home') return respond(interaction, await buildAdminPanel(interaction.guild, displayName(interaction)));
    if (id === 'admin:roleSelector:enable' || id === 'admin:roleSelector:disable') { guildManager.setModuleEnabled(interaction.guildId, roleSelector.MODULE, id.endsWith(':enable'), { ...actor, action: id }); return respond(interaction, await buildAdminPanel(interaction.guild, displayName(interaction))); }
    if (id === 'admin:roleSelector:groups') { state(interaction).page = 'groups'; return respond(interaction, buildGroupsPanel(interaction)); }
    if (id === 'admin:roleSelector:colours') return respond(interaction, buildColoursPanel(interaction.guild));
    if (id === 'admin:roleSelector:style') return respond(interaction, buildStylePanel(interaction.guild));
    if (id === 'admin:roleSelector:stats') return respond(interaction, await buildStatsPanel(interaction.guild));
    if (id === 'admin:roleSelector:groupSelect') { state(interaction).groupId = interaction.values[0]; return respond(interaction, buildGroupsPanel(interaction)); }
    if (id === 'admin:roleSelector:createGroup') { await interaction.showModal(groupModal()); return true; }
    if (id === 'admin:roleSelector:createGroupSubmit') { const name = interaction.fields.getTextInputValue('name'); const mode = interaction.fields.getTextInputValue('mode').trim().toLowerCase(); const group = roleSelector.saveGroup(interaction.guildId, { name, emoji: interaction.fields.getTextInputValue('emoji'), description: interaction.fields.getTextInputValue('description'), selectionMode: mode === 'multiple' ? 'multiple' : 'single', allowRemove: true, options: [] }, { ...actor, action: 'role_selector_create_group' }); state(interaction).groupId = group.id; return interaction.reply({ content: `✅ Created selector **${group.name}**.`, ...buildGroupsPanel(interaction), flags: 64 }); }
    if (id === 'admin:roleSelector:addOptions') { const group = roleSelector.getGroup(interaction.guildId, state(interaction).groupId); if (!group || group.builtIn) throw new Error('Select a custom group first.'); await interaction.showModal(optionsModal(group)); return true; }
    if (id === 'admin:roleSelector:addOptionsSubmit') { const group = roleSelector.getGroup(interaction.guildId, state(interaction).groupId); const previous = new Map((group.options || []).map((option) => [option.label.toLowerCase(), option])); const options = interaction.fields.getTextInputValue('options').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 25).map((line, index) => { const [emoji, label, ...desc] = line.split('|').map((part) => part.trim()); if (!label) throw new Error(`Option ${index + 1} needs a label.`); const old = previous.get(label.toLowerCase()); return { ...(old || {}), id: old?.id || undefined, emoji, label, description: desc.join(' | '), enabled: true, order: (index + 1) * 10, managed: old?.managed !== false }; }); roleSelector.saveGroup(interaction.guildId, { ...group, options }, { ...actor, action: 'role_selector_update_options' }); return interaction.reply({ content: '✅ Selector options saved.', ...buildGroupsPanel(interaction), flags: 64 }); }
    if (id === 'admin:roleSelector:toggleMode') { const group = roleSelector.getGroup(interaction.guildId, state(interaction).groupId); roleSelector.saveGroup(interaction.guildId, { ...group, selectionMode: group.selectionMode === 'multiple' ? 'single' : 'multiple' }, { ...actor, action: 'role_selector_toggle_mode' }); return respond(interaction, buildGroupsPanel(interaction)); }
    if (id === 'admin:roleSelector:toggleRemove') { const group = roleSelector.getGroup(interaction.guildId, state(interaction).groupId); roleSelector.saveGroup(interaction.guildId, { ...group, allowRemove: !group.allowRemove }, { ...actor, action: 'role_selector_toggle_remove' }); return respond(interaction, buildGroupsPanel(interaction)); }
    if (id === 'admin:roleSelector:deleteGroup') { const group = roleSelector.getGroup(interaction.guildId, state(interaction).groupId); if (!group || group.builtIn) throw new Error('Select a custom group first.'); roleSelector.removeGroup(interaction.guildId, group.id, { ...actor, action: 'role_selector_delete_group' }); state(interaction).groupId = roleSelector.COLOUR_GROUP_ID; return respond(interaction, buildGroupsPanel(interaction)); }
    if (id === 'admin:roleSelector:palette') { const group = roleSelector.getGroup(interaction.guildId, roleSelector.COLOUR_GROUP_ID); const selected = new Set(interaction.values || []); roleSelector.saveGroup(interaction.guildId, { ...group, palette: group.palette.map((item) => ({ ...item, enabled: selected.has(item.id) })) }, { ...actor, action: 'role_selector_palette' }); return respond(interaction, buildColoursPanel(interaction.guild)); }
    if (id === 'admin:roleSelector:toggleHex') { const group = roleSelector.getGroup(interaction.guildId, roleSelector.COLOUR_GROUP_ID); roleSelector.saveGroup(interaction.guildId, { ...group, customHexEnabled: !group.customHexEnabled }, { ...actor, action: 'role_selector_hex_toggle' }); return respond(interaction, buildColoursPanel(interaction.guild)); }
    if (id === 'admin:roleSelector:styleModalOpen') { await interaction.showModal(styleModal(roleSelector.getSection(interaction.guildId))); return true; }
    if (id === 'admin:roleSelector:styleSubmit') { roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, format: interaction.fields.getTextInputValue('format'), icon: interaction.fields.getTextInputValue('icon'), separator: interaction.fields.getTextInputValue('separator') || '|' } }), { ...actor, action: 'role_selector_style' }); await roleSelector.syncManagedRoleAppearance(interaction.guild); return interaction.reply({ content: '✅ Role style updated.', flags: 64 }); }
    if (id === 'admin:roleSelector:anchor') { roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, anchorRoleId: interaction.values?.[0] || null } }), { ...actor, action: 'role_selector_anchor' }); await roleSelector.syncManagedRoleHierarchy(interaction.guild); return respond(interaction, buildStylePanel(interaction.guild)); }
    if (id === 'admin:roleSelector:togglePlacement') { roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, placement: current.style.placement === 'above' ? 'below' : 'above' } }), { ...actor, action: 'role_selector_placement' }); await roleSelector.syncManagedRoleHierarchy(interaction.guild); return respond(interaction, buildStylePanel(interaction.guild)); }
    if (id === 'admin:roleSelector:toggleGrouped') { roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, keepGrouped: !current.style.keepGrouped } }), { ...actor, action: 'role_selector_grouping' }); await roleSelector.syncManagedRoleHierarchy(interaction.guild); return respond(interaction, buildStylePanel(interaction.guild)); }
    if (id === 'admin:roleSelector:scanStyle') { const suggestion = roleSelector.suggestRoleStyle(interaction.guild); roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, detectedFormat: suggestion.format, detectedIcon: suggestion.icon, detectedSeparator: suggestion.separator, detectedConfidence: suggestion.confidence } }), { ...actor, action: 'role_selector_style_scan' }); return respond(interaction, buildStylePanel(interaction.guild)); }
    if (id === 'admin:roleSelector:applyStyle') { roleSelector.updateSection(interaction.guildId, (current) => ({ ...current, style: { ...current.style, format: current.style.detectedFormat || current.style.format, icon: current.style.detectedIcon || '', separator: current.style.detectedSeparator || current.style.separator } }), { ...actor, action: 'role_selector_style_apply' }); await roleSelector.syncManagedRoleAppearance(interaction.guild); return respond(interaction, buildStylePanel(interaction.guild)); }
    if (id === 'admin:roleSelector:deploy') { const message = await deploySelector(interaction); return interaction.reply({ content: `✅ Role Selector deployed in <#${message.channel.id}>.`, flags: 64 }); }
    if (id === 'admin:roleSelector:statsGroup') return respond(interaction, await buildGroupStats(interaction.guild, interaction.values[0]));
    if (id === 'admin:roleSelector:health') { const health = await healthService.repair(interaction.guild); return interaction.reply({ content: `Role Selector health: **${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}**\nIssues: ${health.issues.length} · Warnings: ${health.warnings.length}`, flags: 64 }); }

    if (id === 'roleSelector:openGroup') return interaction.reply({ ...memberGroupPayload(interaction.guild, interaction.member, interaction.values[0]), flags: 64 });
    if (id === 'roleSelector:colourChoose') { await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.values[0]); return interaction.reply({ content: '✅ Your colour has been updated.', flags: 64 }); }
    if (id === 'roleSelector:customHex') { await interaction.showModal(hexModal()); return true; }
    if (id === 'roleSelector:customHexSubmit') { await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.fields.getTextInputValue('hex'), interaction.fields.getTextInputValue('label')); return interaction.reply({ content: '✅ Your custom colour has been applied.', flags: 64 }); }
    if (id.startsWith('roleSelector:choose:')) { const groupId = id.split(':').slice(2).join(':'); await roleSelector.applyStandardSelection(interaction.guild, interaction.member, groupId, interaction.values || []); return interaction.reply({ content: '✅ Your role selection has been updated.', flags: 64 }); }
    if (id.startsWith('roleSelector:clear:')) { const groupId = id.split(':').slice(2).join(':'); await roleSelector.clearSelection(interaction.guild, interaction.member, groupId); return interaction.reply({ content: '✅ Your selection has been cleared.', flags: 64 }); }

    // Old deployed Colour Roles messages remain usable long enough to migrate/redeploy.
    if (id === 'colourRoles:choose') { await roleSelector.applyColourSelection(interaction.guild, interaction.member, interaction.values[0]); return interaction.reply({ content: '✅ Your colour has been updated.', flags: 64 }); }
    if (id === 'colourRoles:remove') { await roleSelector.clearSelection(interaction.guild, interaction.member, roleSelector.COLOUR_GROUP_ID); return interaction.reply({ content: '✅ Your colour has been removed.', flags: 64 }); }
    if (id === 'colourRoles:custom') { await interaction.showModal(hexModal()); return true; }
    return true;
  } catch (error) {
    const payload = { content: `❌ Role Selector failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null); else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildAdminPanel, memberLauncherPayload, handleRoleSelectorInteraction };
