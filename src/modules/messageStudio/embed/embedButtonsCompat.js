'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getAllEmbedDeployments } = require('./embedDeployments');
const panel = require('./embedPanel');

const MAX_BUTTONS = panel.MAX_BUTTONS || 20;
const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;
const MAX_DEPLOYED_BUTTON_ROWS = panel.MAX_DEPLOYED_BUTTON_ROWS || Math.max(1, Math.min(4, MAX_ACTION_ROWS - 1));
const BUILT_IN_ACTIONS = Object.freeze(['reply', 'toggle-role', 'add-role', 'remove-role', 'user-info', 'server-info']);
const ROLE_ACTIONS = new Set(['toggle-role', 'add-role', 'remove-role']);
const DANGEROUS_ROLE_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ModerateMembers,
];

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}
function resolved(value, interaction) {
  try { return typeof panel.replaceVars === 'function' && interaction ? panel.replaceVars(String(value || ''), interaction) : String(value || ''); }
  catch { return String(value || ''); }
}

function selectedIndex(state) { const buttons = Array.isArray(state.buttons) ? state.buttons : []; return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null; }
function normalizedStyle(value) { const style = String(value || 'primary').toLowerCase(); return ['primary', 'secondary', 'success', 'danger'].includes(style) ? style : 'primary'; }
function styleLabel(style) { return { primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger' }[normalizedStyle(style)]; }
function actionLabel(action) { return { reply: 'Reply', 'toggle-role': 'Toggle Role', 'add-role': 'Add Role', 'remove-role': 'Remove Role', 'user-info': 'User Info', 'server-info': 'Server Info' }[String(action || '').toLowerCase()] || 'None'; }
const normalizedRow = panel.embedButtonRow;
function rowLabel(value) { const row = normalizedRow(value); return row == null ? 'Auto' : `Row ${row + 1}`; }
function roleDisplay(interaction, roleId) { const role = interaction?.guild?.roles?.cache?.get?.(String(roleId || '').replace(/\D/g, '')); return role ? `<@&${role.id}>` : roleId ? `Role ${roleId}` : 'Not selected'; }
const layoutButtons = panel.layoutEmbedButtons;
function deployedRowFor(buttons, index) { const rows = layoutButtons(buttons); const row = rows.findIndex((entries) => entries.some((entry) => entry.index === index)); return row >= 0 ? row : null; }

function buildButtonEditorModal(state, index = null) {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const item = Number.isInteger(index) ? (buttons[index] || {}) : {};
  return panel.modal(
    Number.isInteger(index) ? `embed:button-manager-save:${index}` : 'embed:button-manager-save-new',
    Number.isInteger(index) ? 'Edit Button' : 'Add Button',
    [
      panel.input('label', 'Button label', TextInputStyle.Short, item.label || '', true, 80),
      panel.input('emoji', 'Emoji (optional)', TextInputStyle.Short, item.emoji || '', false, 100),
      panel.input('url', 'Link URL / variable (optional)', TextInputStyle.Short, item.url || '', false, 4000),
    ],
  );
}
function buildButtonReplyModal(state) {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const index = selectedIndex(state);
  const item = index == null ? {} : (buttons[index] || {});
  return panel.modal('embed:button-reply-save', 'Button Reply Text', [
    panel.input('replyText', 'Reply text / variables', TextInputStyle.Paragraph, item.actionValue || '', true, 1000),
  ]);
}
panel.buttonEditorModal = buildButtonEditorModal;
panel.buttonReplyModal = buildButtonReplyModal;

function buildButtonOptionsPanel(interaction) {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state);
  if (index == null) return panel.buildButtonsManagerPanel(interaction);
  const item = buttons[index], style = normalizedStyle(item.style), action = String(item.action || '').toLowerCase();
  const currentAction = BUILT_IN_ACTIONS.includes(action) ? action : 'none', configuredRow = normalizedRow(item.row), actualRow = deployedRowFor(buttons, index);
  const destination = item.url ? `Link: ${panel.trim(item.url, 800)}` : action ? `Action: ${actionLabel(action)}${BUILT_IN_ACTIONS.includes(action) ? '' : ' (unsupported legacy action)'}` : 'No destination configured';
  const details = [`**Button:** ${index + 1} / ${buttons.length}`, `**Label:** ${item.label || 'Button'}`, `**Style:** ${styleLabel(style)}`, `**Destination:** ${destination}`, `**Layout:** ${rowLabel(item.row)}${actualRow != null ? ` → deploys on Row ${actualRow + 1}` : ''}`];
  if (ROLE_ACTIONS.has(action)) details.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
  if (action === 'reply') details.push(`**Reply:** ${item.actionValue ? panel.trim(resolved(item.actionValue, interaction), 900) : 'Not configured'}`);
  details.push('', 'Choose the action and row placement below. Auto placement fills the first available row. A Discord button row can never contain more than 5 buttons.');
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-style:primary').setLabel('🔵 Primary').setStyle(style === 'primary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:secondary').setLabel('⚪ Secondary').setStyle(style === 'secondary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:success').setLabel('🟢 Success').setStyle(style === 'success' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:danger').setLabel('🔴 Danger').setStyle(style === 'danger' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:button-action-select').setPlaceholder('Choose button action').setMinValues(1).setMaxValues(1).addOptions([
      { label: 'No Action / Link', value: 'none', description: 'Use no bot action; optionally configure a link', default: currentAction === 'none' },
      { label: 'Reply', value: 'reply', description: 'Send the clicker an ephemeral reply', default: currentAction === 'reply' },
      { label: 'Toggle Role', value: 'toggle-role', description: 'Add or remove the selected role', default: currentAction === 'toggle-role' },
      { label: 'Add Role', value: 'add-role', description: 'Give the selected role', default: currentAction === 'add-role' },
      { label: 'Remove Role', value: 'remove-role', description: 'Remove the selected role', default: currentAction === 'remove-role' },
      { label: 'User Info', value: 'user-info', description: 'Show the clicker their Discord information', default: currentAction === 'user-info' },
      { label: 'Server Info', value: 'server-info', description: 'Show information about this server', default: currentAction === 'server-info' },
    ])),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:button-row-select').setPlaceholder('Choose button row').setMinValues(1).setMaxValues(1).addOptions([
      { label: 'Auto placement', value: 'auto', description: 'Fill the first available row automatically', default: configuredRow == null },
      ...Array.from({ length: MAX_DEPLOYED_BUTTON_ROWS }, (_, row) => ({ label: `Row ${row + 1}`, value: String(row), description: `Place this button on Discord button row ${row + 1}`, default: configuredRow === row })),
    ])),
  ];
  if (ROLE_ACTIONS.has(action)) rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('embed:button-action-role').setPlaceholder('Select role for this button').setMinValues(1).setMaxValues(1)));
  else if (action === 'reply') rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:button-reply-edit').setLabel('✏️ Reply Text').setStyle(ButtonStyle.Primary)));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:button-options-back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Button Options').setDescription(details.join('\n').slice(0, 4096))], components: enforceLimits(rows) };
}
panel.buildButtonOptionsPanel = buildButtonOptionsPanel;

function buildButtonsManagerPanel(interaction) {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state), item = index == null ? null : buttons[index];
  const layout = layoutButtons(buttons), usedRows = layout.filter((row) => row.length).length;
  const lines = [`**Buttons:** ${buttons.length}/${MAX_BUTTONS}`, `**Rows used when deployed:** ${usedRows}/${MAX_DEPLOYED_BUTTON_ROWS}`, ''];
  if (item) {
    const destination = item.url ? `Link: ${panel.trim(item.url, 1000)}` : item.action ? `Action: ${actionLabel(item.action)}` : 'No destination configured';
    const actualRow = deployedRowFor(buttons, index);
    lines.push(`**Selected button ${index + 1}:** ${item.emoji ? `${item.emoji} ` : ''}${item.label || 'Button'}`, `**Style:** ${styleLabel(item.style)}`, `**Destination:** ${destination}`, `**Row:** ${rowLabel(item.row)}${actualRow != null ? ` → Row ${actualRow + 1}` : ''}`);
    if (ROLE_ACTIONS.has(String(item.action || '').toLowerCase())) lines.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
    if (item.action === 'reply' && item.actionValue) lines.push(`**Reply:** ${panel.trim(resolved(item.actionValue, interaction), 900)}`);
  } else lines.push('**Selected button:** None');
  lines.push('', 'Buttons support automatic or explicit row placement. Discord limits are enforced: up to 5 buttons per row and up to 20 buttons across 4 button rows.');
  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('🔘 Buttons').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) {
    const previewLabel = panel.trim(resolved(item.label || 'Button', interaction), 80) || 'Button', previewUrl = panel.safeUrl(resolved(item.url, interaction)) || '', actualRow = deployedRowFor(buttons, index);
    embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Button Preview').setDescription([`**Label:** ${item.emoji ? `${item.emoji} ` : ''}${previewLabel}`, `**Style:** ${previewUrl ? 'Link' : styleLabel(item.style)}`, `**Destination:** ${previewUrl ? previewUrl : item.action ? `Action: ${actionLabel(item.action)}` : 'Not configured'}`, `**Deploy row:** ${actualRow == null ? 'Not placed' : actualRow + 1}`].join('\n').slice(0, 4096)));
  }
  const rows = [];
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:button-manager-select').setPlaceholder('Select button').setMinValues(1).setMaxValues(1).addOptions(buttons.map((button, buttonIndex) => ({ label: `${buttonIndex + 1}. ${panel.trim(button.label || 'Button', 80)}`, value: String(buttonIndex), description: panel.trim(`${rowLabel(button.row)} • ${button.url || actionLabel(button.action) || styleLabel(button.style)}`, 100), default: buttonIndex === index })))));
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-manager-add').setLabel('➕ Add').setStyle(ButtonStyle.Success).setDisabled(buttons.length >= MAX_BUTTONS),
      new ButtonBuilder().setCustomId('embed:button-manager-edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Primary).setDisabled(index == null),
      new ButtonBuilder().setCustomId('embed:button-manager-options').setLabel('⚙️ Options').setStyle(ButtonStyle.Secondary).setDisabled(index == null),
      new ButtonBuilder().setCustomId('embed:button-manager-remove').setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger).setDisabled(index == null),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-manager-up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index <= 0),
      new ButtonBuilder().setCustomId('embed:button-manager-down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index >= buttons.length - 1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds, components: enforceLimits(rows) };
}
panel.buildButtonsManagerPanel = buildButtonsManagerPanel;

function cleanAction(value) { return String(value || '').trim().toLowerCase().replace(/_/g, '-'); }
function parseRoleId(value) { const raw = String(value || '').replace(/[<@&>]/g, '').trim(); return /^\d{15,25}$/.test(raw) ? raw : null; }
function deploymentForMessage(guildId, messageId) { const deployments = Object.values(getAllEmbedDeployments(guildId) || {}); return deployments.find((item) => String(item?.messageId || '') === String(messageId || '')) || null; }
function presetForDeployment(guildId, deployment) { if (!deployment) return null; const presets = typeof guildManager.getEmbedPresets === 'function' ? guildManager.getEmbedPresets(guildId) || {} : {}; return presets[deployment.preset] || presets[deployment.key] || null; }
function buttonsForPreset(preset) { if (!preset || typeof preset !== 'object') return []; if (Array.isArray(preset.buttons) && preset.buttons.length) return preset.buttons; const panels = Array.isArray(preset.panels) ? preset.panels : []; const selectedPanelIndex = Number.isInteger(preset.selectedPanelIndex) ? preset.selectedPanelIndex : null; if (selectedPanelIndex != null && Array.isArray(panels[selectedPanelIndex]?.buttons)) return panels[selectedPanelIndex].buttons; const panelsWithButtons = panels.filter((entry) => Array.isArray(entry?.buttons) && entry.buttons.length); if (panelsWithButtons.length === 1) return panelsWithButtons[0].buttons; if (Array.isArray(panels[0]?.buttons)) return panels[0].buttons; return []; }
function parseButtonIndex(customId) { const id = String(customId || ''); let match = id.match(/^embed:action:(\d+)$/); if (match) return Number(match[1]); match = id.match(/^embed-action:.*:(\d+)$/); return match ? Number(match[1]) : null; }
function legacyActionFromId(customId) { const match = String(customId || '').match(/^embed-action:(.*):(\d+)$/); return match ? cleanAction(match[1]) : ''; }
function resolveButton(interaction) { const index = parseButtonIndex(interaction.customId); if (!Number.isInteger(index) || index < 0 || index >= MAX_BUTTONS) return { index, button: null, deployment: null }; const deployment = deploymentForMessage(interaction.guildId, interaction.message?.id); const preset = presetForDeployment(interaction.guildId, deployment); const buttons = buttonsForPreset(preset); return { index, button: buttons[index] || null, deployment }; }
async function ephemeral(interaction, payload) { const body = typeof payload === 'string' ? { content: payload } : payload; if (interaction.deferred || interaction.replied) return interaction.followUp({ ...body, flags: MessageFlags.Ephemeral }); return interaction.reply({ ...body, flags: MessageFlags.Ephemeral }); }
function roleIsSafe(role, guild) { if (!role || !guild) return { ok: false, reason: 'Role not found.' }; if (role.managed) return { ok: false, reason: 'That role is managed by Discord or another integration.' }; const me = guild.members.me; if (!me || !role.editable || role.position >= me.roles.highest.position) return { ok: false, reason: 'Goliath cannot manage that role.' }; if (DANGEROUS_ROLE_PERMISSIONS.some((permission) => role.permissions.has(permission))) return { ok: false, reason: 'Self-service buttons cannot manage privileged moderation or administration roles.' }; return { ok: true }; }
async function executeRoleAction(interaction, action, value) {
  const roleId = parseRoleId(resolved(value, interaction));
  if (!roleId) return ephemeral(interaction, '❌ This button does not have a valid role configured.');
  const role = interaction.guild?.roles?.cache?.get(roleId) || await interaction.guild?.roles?.fetch?.(roleId).catch(() => null);
  const safe = roleIsSafe(role, interaction.guild);
  if (!safe.ok) return ephemeral(interaction, `❌ ${safe.reason}`);
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return ephemeral(interaction, '❌ Your server member record could not be loaded.');
  if (action === 'add-role') { if (member.roles.cache.has(roleId)) return ephemeral(interaction, `ℹ️ You already have **${role.name}**.`); await member.roles.add(role, `Embed Studio button used by ${interaction.user.tag || interaction.user.id}`); return ephemeral(interaction, `✅ Added **${role.name}**.`); }
  if (action === 'remove-role') { if (!member.roles.cache.has(roleId)) return ephemeral(interaction, `ℹ️ You do not have **${role.name}**.`); await member.roles.remove(role, `Embed Studio button used by ${interaction.user.tag || interaction.user.id}`); return ephemeral(interaction, `✅ Removed **${role.name}**.`); }
  const hasRole = member.roles.cache.has(roleId);
  if (hasRole) await member.roles.remove(role, `Embed Studio role toggle used by ${interaction.user.tag || interaction.user.id}`); else await member.roles.add(role, `Embed Studio role toggle used by ${interaction.user.tag || interaction.user.id}`);
  return ephemeral(interaction, `${hasRole ? '✅ Removed' : '✅ Added'} **${role.name}**.`);
}
async function handleButtonAction(interaction) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || '');
  if (!id.startsWith('embed:action:') && !id.startsWith('embed-action:')) return false;
  const { button } = resolveButton(interaction), action = cleanAction(button?.action || legacyActionFromId(id)), value = button?.actionValue ?? button?.value ?? '';
  if (!action || action === 'custom' || action === 'none') { await ephemeral(interaction, 'ℹ️ This button does not have an action configured yet.'); return true; }
  if (action === 'reply' || action === 'message') { await ephemeral(interaction, resolved(value || 'Button pressed.', interaction).slice(0, 2000) || 'Button pressed.'); return true; }
  if (ROLE_ACTIONS.has(action)) { await executeRoleAction(interaction, action, value); return true; }
  if (action === 'user-info') { const member = interaction.member; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Your Server Info').setDescription([`**User:** <@${interaction.user.id}>`, `**User ID:** \`${interaction.user.id}\``, `**Joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown'}`, `**Roles:** ${member?.roles?.cache ? Math.max(0, member.roles.cache.size - 1) : 'Unknown'}`].join('\n')); await ephemeral(interaction, { embeds: [embed] }); return true; }
  if (action === 'server-info') { const guild = interaction.guild; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏠 ${guild?.name || 'Server'}`).setDescription([`**Members:** ${guild?.memberCount ?? 'Unknown'}`, `**Server ID:** \`${guild?.id || 'Unknown'}\``, `**Created:** ${guild?.createdTimestamp ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>` : 'Unknown'}`].join('\n')); if (guild?.iconURL?.()) embed.setThumbnail(guild.iconURL({ size: 256 })); await ephemeral(interaction, { embeds: [embed] }); return true; }
  await ephemeral(interaction, `⚠️ The action \`${action}\` is not registered.`); return true;
}

panel.EMBED_BUTTON_ACTIONS = BUILT_IN_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = ROLE_ACTIONS;
panel.handleButtonAction = handleButtonAction;
panel.parseButtonActionIndex = parseButtonIndex;
panel.resolveButtonAction = resolveButton;
panel.supportedButtonActions = BUILT_IN_ACTIONS;

module.exports = panel;
