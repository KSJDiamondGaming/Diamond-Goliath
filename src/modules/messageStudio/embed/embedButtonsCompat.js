'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getAllEmbedDeployments } = require('./embedDeployments');
const panel = require('./embedPanel');

const MAX_FIELDS = 25;
const MAX_BUTTONS = 20;
const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;
const MAX_DEPLOYED_BUTTON_ROWS = 4;
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
function short(value, max = 500) { const text = String(value || ''); return text.length > max ? `${text.slice(0, max - 3)}...` : text; }
function resolved(value, interaction) {
  try { return typeof panel.replaceVars === 'function' && interaction ? panel.replaceVars(String(value || ''), interaction) : String(value || ''); }
  catch { return String(value || ''); }
}

function fieldInput(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));
}
function selectedFieldIndex(state) {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  return Number.isInteger(state.selectedFieldIndex) && fields[state.selectedFieldIndex] ? state.selectedFieldIndex : null;
}
panel.fieldEditorModal = (state, index = null) => {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  const item = Number.isInteger(index) ? (fields[index] || {}) : {};
  return new ModalBuilder().setCustomId(Number.isInteger(index) ? `embed:field-manager-save:${index}` : 'embed:field-manager-save-new').setTitle(Number.isInteger(index) ? 'Edit Field' : 'Add Field').addComponents(
    new ActionRowBuilder().addComponents(fieldInput('name', 'Field name', TextInputStyle.Short, item.name || '', 256)),
    new ActionRowBuilder().addComponents(fieldInput('value', 'Field content', TextInputStyle.Paragraph, item.value || '', 1024)),
  );
};
panel.buildFieldsManagerPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const fields = Array.isArray(state.fields) ? state.fields : [];
  const index = selectedFieldIndex(state);
  const item = index == null ? null : fields[index];
  const layout = ['auto', '1', '2', '3'].includes(String(state.fieldLayout)) ? String(state.fieldLayout) : 'auto';
  const lines = [`**Panel:** ${(Number(state.selectedPanelIndex) || 0) + 1} / ${state.panels?.length || 1}`, `**Fields:** ${fields.length}/${MAX_FIELDS}`, `**Layout:** ${layout === 'auto' ? 'Auto' : `${layout} per row`}`, ''];
  if (item) lines.push(`**Selected field ${index + 1}:** ${short(item.name || 'Field', 300)}`, `**Inline:** ${item.inline ? 'Yes' : 'No'}`, `**Content:** ${short(item.value || '', 900) || 'Not set'}`);
  else lines.push('**Selected field:** None');
  lines.push('', 'Field names and content support Embed Studio variables. Use Inline to allow fields to share a row; the Layout setting controls the overall row arrangement.');
  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Fields').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Field Preview').addFields({ name: short(resolved(item.name, interaction), 256) || 'Field', value: short(resolved(item.value, interaction), 1024) || 'No content', inline: Boolean(item.inline) }));
  const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:field-manager-layout').setPlaceholder('Field layout').setMinValues(1).setMaxValues(1).addOptions([
    { label: 'Auto', value: 'auto', description: 'Let Embed Studio arrange fields', default: layout === 'auto' },
    { label: '1 field per row', value: '1', default: layout === '1' },
    { label: '2 fields per row', value: '2', default: layout === '2' },
    { label: '3 fields per row', value: '3', default: layout === '3' },
  ]))];
  if (fields.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:field-manager-select').setPlaceholder('Select field').setMinValues(1).setMaxValues(1).addOptions(fields.map((field, fieldIndex) => ({ label: `${fieldIndex + 1}. ${short(field.name || 'Field', 80)}`, value: String(fieldIndex), description: short(field.value || 'No content', 100), default: fieldIndex === index })))));
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:field-manager-add').setLabel('➕ Add').setStyle(ButtonStyle.Success).setDisabled(fields.length >= MAX_FIELDS),
      new ButtonBuilder().setCustomId('embed:field-manager-edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Primary).setDisabled(index == null),
      new ButtonBuilder().setCustomId('embed:field-manager-inline').setLabel(item?.inline ? '↔️ Inline ON' : '↔️ Inline OFF').setStyle(item?.inline ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(index == null),
      new ButtonBuilder().setCustomId('embed:field-manager-remove').setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger).setDisabled(index == null),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:field-manager-up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index <= 0),
      new ButtonBuilder().setCustomId('embed:field-manager-down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index >= fields.length - 1),
    ),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)),
  );
  return { embeds, components: enforceLimits(rows) };
};
panel.MAX_EMBED_FIELDS = MAX_FIELDS;

function input(id, label, value = '', maxLength = 4000, required = false, style = TextInputStyle.Short) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));
}
function selectedIndex(state) { const buttons = Array.isArray(state.buttons) ? state.buttons : []; return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null; }
function normalizedStyle(value) { const style = String(value || 'primary').toLowerCase(); return ['primary', 'secondary', 'success', 'danger'].includes(style) ? style : 'primary'; }
function styleLabel(style) { return { primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger' }[normalizedStyle(style)]; }
function actionLabel(action) { return { reply: 'Reply', 'toggle-role': 'Toggle Role', 'add-role': 'Add Role', 'remove-role': 'Remove Role', 'user-info': 'User Info', 'server-info': 'Server Info' }[String(action || '').toLowerCase()] || 'None'; }
function normalizedRow(value) { if (value === '' || value == null || value === 'auto') return null; const row = Number(value); return Number.isInteger(row) && row >= 0 && row < MAX_DEPLOYED_BUTTON_ROWS ? row : null; }
function rowLabel(value) { const row = normalizedRow(value); return row == null ? 'Auto' : `Row ${row + 1}`; }
function resolveUrl(value, interaction) { const raw = resolved(value, interaction).trim(); if (!raw) return ''; try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function styleValue(style) { return { secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[normalizedStyle(style)] || ButtonStyle.Primary; }
function actionId(button, absoluteIndex) { if (button?.id) return String(button.id).trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 100); return `embed:action:${absoluteIndex}`; }
function roleDisplay(interaction, roleId) { const role = interaction?.guild?.roles?.cache?.get?.(String(roleId || '').replace(/\D/g, '')); return role ? `<@&${role.id}>` : roleId ? `Role ${roleId}` : 'Not selected'; }
function layoutButtons(buttons = []) {
  const rows = Array.from({ length: MAX_DEPLOYED_BUTTON_ROWS }, () => []);
  const automatic = [];
  buttons.slice(0, MAX_BUTTONS).forEach((button, index) => { const row = normalizedRow(button?.row); if (row != null && rows[row].length < MAX_COMPONENTS_PER_ROW) rows[row].push({ button, index }); else automatic.push({ button, index }); });
  for (const entry of automatic) { const target = rows.findIndex((row) => row.length < MAX_COMPONENTS_PER_ROW); if (target < 0) break; rows[target].push(entry); }
  return rows;
}
function deployedRowFor(buttons, index) { const rows = layoutButtons(buttons); const row = rows.findIndex((entries) => entries.some((entry) => entry.index === index)); return row >= 0 ? row : null; }

panel.buttonRows = (state, interaction = null) => {
  const output = [];
  for (const entries of layoutButtons(Array.isArray(state?.buttons) ? state.buttons : [])) {
    if (!entries.length) continue;
    const row = new ActionRowBuilder();
    for (const { button, index } of entries) {
      const label = short(resolved(button?.label || 'Button', interaction), 80) || 'Button';
      const url = resolveUrl(button?.url, interaction);
      const builder = new ButtonBuilder().setLabel(label);
      if (button?.emoji) builder.setEmoji(button.emoji);
      if (url) builder.setStyle(ButtonStyle.Link).setURL(url);
      else builder.setStyle(styleValue(button?.style)).setCustomId(actionId(button, index));
      row.addComponents(builder);
    }
    output.push(row);
  }
  return output.slice(0, MAX_DEPLOYED_BUTTON_ROWS);
};

panel.buttonEditorModal = (state, index = null) => {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const item = Number.isInteger(index) ? (buttons[index] || {}) : {};
  return new ModalBuilder().setCustomId(Number.isInteger(index) ? `embed:button-manager-save:${index}` : 'embed:button-manager-save-new').setTitle(Number.isInteger(index) ? 'Edit Button' : 'Add Button').addComponents(
    new ActionRowBuilder().addComponents(input('label', 'Button label', item.label || '', 80, true)),
    new ActionRowBuilder().addComponents(input('emoji', 'Emoji (optional)', item.emoji || '', 100, false)),
    new ActionRowBuilder().addComponents(input('url', 'Link URL / variable (optional)', item.url || '', 4000, false)),
  );
};
panel.buttonReplyModal = (state) => { const buttons = Array.isArray(state.buttons) ? state.buttons : []; const index = selectedIndex(state); const item = index == null ? {} : (buttons[index] || {}); return new ModalBuilder().setCustomId('embed:button-reply-save').setTitle('Button Reply Text').addComponents(new ActionRowBuilder().addComponents(input('replyText', 'Reply text / variables', item.actionValue || '', 1000, true, TextInputStyle.Paragraph))); };

panel.buildButtonOptionsPanel = (interaction) => {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state);
  if (index == null) return panel.buildButtonsManagerPanel(interaction);
  const item = buttons[index], style = normalizedStyle(item.style), action = String(item.action || '').toLowerCase();
  const currentAction = BUILT_IN_ACTIONS.includes(action) ? action : 'none', configuredRow = normalizedRow(item.row), actualRow = deployedRowFor(buttons, index);
  const destination = item.url ? `Link: ${short(item.url, 800)}` : action ? `Action: ${actionLabel(action)}${BUILT_IN_ACTIONS.includes(action) ? '' : ' (unsupported legacy action)'}` : 'No destination configured';
  const details = [`**Button:** ${index + 1} / ${buttons.length}`, `**Label:** ${item.label || 'Button'}`, `**Style:** ${styleLabel(style)}`, `**Destination:** ${destination}`, `**Layout:** ${rowLabel(item.row)}${actualRow != null ? ` → deploys on Row ${actualRow + 1}` : ''}`];
  if (ROLE_ACTIONS.has(action)) details.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
  if (action === 'reply') details.push(`**Reply:** ${item.actionValue ? short(resolved(item.actionValue, interaction), 900) : 'Not configured'}`);
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
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:button-options-back').setLabel('⬅️ Buttons').setStyle(ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Button Options').setDescription(details.join('\n').slice(0, 4096))], components: enforceLimits(rows) };
};

panel.buildButtonsManagerPanel = (interaction) => {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state), item = index == null ? null : buttons[index];
  const layout = layoutButtons(buttons), usedRows = layout.filter((row) => row.length).length;
  const lines = [`**Buttons:** ${buttons.length}/${MAX_BUTTONS}`, `**Rows used when deployed:** ${usedRows}/${MAX_DEPLOYED_BUTTON_ROWS}`, ''];
  if (item) {
    const destination = item.url ? `Link: ${short(item.url, 1000)}` : item.action ? `Action: ${actionLabel(item.action)}` : 'No destination configured';
    const actualRow = deployedRowFor(buttons, index);
    lines.push(`**Selected button ${index + 1}:** ${item.emoji ? `${item.emoji} ` : ''}${item.label || 'Button'}`, `**Style:** ${styleLabel(item.style)}`, `**Destination:** ${destination}`, `**Row:** ${rowLabel(item.row)}${actualRow != null ? ` → Row ${actualRow + 1}` : ''}`);
    if (ROLE_ACTIONS.has(String(item.action || '').toLowerCase())) lines.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
    if (item.action === 'reply' && item.actionValue) lines.push(`**Reply:** ${short(resolved(item.actionValue, interaction), 900)}`);
  } else lines.push('**Selected button:** None');
  lines.push('', 'Buttons support automatic or explicit row placement. Discord limits are enforced: up to 5 buttons per row and up to 20 buttons across 4 button rows.');
  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('🔘 Buttons').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) {
    const previewLabel = short(resolved(item.label || 'Button', interaction), 80) || 'Button', previewUrl = resolveUrl(item.url, interaction), actualRow = deployedRowFor(buttons, index);
    embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Button Preview').setDescription([`**Label:** ${item.emoji ? `${item.emoji} ` : ''}${previewLabel}`, `**Style:** ${previewUrl ? 'Link' : styleLabel(item.style)}`, `**Destination:** ${previewUrl ? previewUrl : item.action ? `Action: ${actionLabel(item.action)}` : 'Not configured'}`, `**Deploy row:** ${actualRow == null ? 'Not placed' : actualRow + 1}`].join('\n').slice(0, 4096)));
  }
  const rows = [];
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:button-manager-select').setPlaceholder('Select button').setMinValues(1).setMaxValues(1).addOptions(buttons.map((button, buttonIndex) => ({ label: `${buttonIndex + 1}. ${short(button.label || 'Button', 80)}`, value: String(buttonIndex), description: short(`${rowLabel(button.row)} • ${button.url || actionLabel(button.action) || styleLabel(button.style)}`, 100), default: buttonIndex === index })))));
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
      new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds, components: enforceLimits(rows) };
};

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

panel.MAX_EMBED_BUTTONS = MAX_BUTTONS;
panel.MAX_BUTTONS_PER_ROW = MAX_COMPONENTS_PER_ROW;
panel.MAX_DEPLOYED_BUTTON_ROWS = MAX_DEPLOYED_BUTTON_ROWS;
panel.EMBED_BUTTON_ACTIONS = BUILT_IN_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = ROLE_ACTIONS;
panel.layoutEmbedButtons = layoutButtons;
panel.embedButtonRow = normalizedRow;
panel.handleButtonAction = handleButtonAction;
panel.parseButtonActionIndex = parseButtonIndex;
panel.resolveButtonAction = resolveButton;
panel.supportedButtonActions = BUILT_IN_ACTIONS;

// Canonical navigation/readiness UI. Kept on the button/panel surface so there is
// no separate navigation compatibility module to maintain.
(() => {
  const { mediaModel } = require('./embedMedia');
  const KNOWN_ACTIONS = new Set(BUILT_IN_ACTIONS);
  const MAX_PANELS = 10;
  const MAX_BUTTON_ROWS = MAX_DEPLOYED_BUTTON_ROWS;
  function navText(value) { return String(value ?? '').trim(); }
  function hasVariable(value) { return /\{[a-zA-Z0-9_]+\}/.test(String(value || '')); }
  function usableUrl(value) { const raw = navText(value); if (!raw) return true; if (hasVariable(raw)) return true; try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
  function navRoleId(value) { const id = navText(value).replace(/[<@&>]/g, ''); return /^\d{15,25}$/.test(id) ? id : null; }
  function requestedBy(interaction) { return panel.memberName?.(interaction) || interaction.member?.displayName || interaction.user?.username || 'Unknown User'; }
  function compactPreviewPayload(payload, interaction) { if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 2) return payload; const state = panel.getSession(interaction); const selectedIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0); const selectedPreview = payload.embeds[selectedIndex + 1] || payload.embeds[1]; return { ...payload, embeds: selectedPreview ? [payload.embeds[0], selectedPreview] : [payload.embeds[0]] }; }
  function push(list, message) { if (!list.includes(message)) list.push(message); }
  function fieldText(panelData = {}) { return [panelData.title, panelData.description, panelData.authorName, panelData.authorIcon, panelData.authorUrl, panelData.footer, panelData.footerIcon, panelData.image, panelData.thumbnail, ...(Array.isArray(panelData.fields) ? panelData.fields.flatMap((field) => [field?.name, field?.value]) : [])].filter(Boolean).join('\n'); }
  function unknownVariables(state) { const source = [...(Array.isArray(state.panels) ? state.panels.map(fieldText) : []), ...(Array.isArray(state.buttons) ? state.buttons.flatMap((button) => [button?.label, button?.url, button?.actionValue]) : [])].join('\n'); const found = [...source.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]); const known = new Set((Array.isArray(panel.HELPERS) ? panel.HELPERS : []).map((item) => String(item).replace(/[{}]/g, '').toLowerCase())); if (!known.size) return []; return [...new Set(found.filter((name) => !known.has(name.toLowerCase())))]; }
  function getReadinessReport(interaction, state = panel.getSession(interaction)) {
    const errors = [], warnings = [], checks = [], panels = Array.isArray(state.panels) ? state.panels : [], buttons = Array.isArray(state.buttons) ? state.buttons : [];
    if (!state.channelId) push(errors, 'Choose a destination channel.'); else checks.push('Destination channel selected');
    if (!panels.length) push(errors, 'At least one content panel is required.');
    if (panels.length > MAX_PANELS) push(errors, `Only ${MAX_PANELS} panels can be used.`);
    panels.forEach((item, index) => {
      const number = index + 1, fields = Array.isArray(item?.fields) ? item.fields : [];
      const hasContent = [item?.title, item?.description, item?.authorName, item?.footer, item?.image, item?.thumbnail].some((value) => navText(value)) || fields.some((field) => navText(field?.name) || navText(field?.value));
      if (!hasContent) push(warnings, `Panel ${number} is empty.`);
      if (fields.length > MAX_FIELDS) push(errors, `Panel ${number} exceeds the ${MAX_FIELDS}-field limit.`);
      fields.forEach((field, fieldIndex) => { if (!navText(field?.name)) push(errors, `Panel ${number}, field ${fieldIndex + 1} is missing a name.`); if (!navText(field?.value)) push(errors, `Panel ${number}, field ${fieldIndex + 1} is missing content.`); });
      [['Author icon', item?.authorIcon], ['Author URL', item?.authorUrl], ['Footer icon', item?.footerIcon], ['Thumbnail', item?.thumbnail], ['Image', item?.image]].forEach(([label, value]) => { if (navText(value) && !usableUrl(value)) push(errors, `Panel ${number} ${label.toLowerCase()} is not a valid URL or variable.`); });
      const media = mediaModel.mediaForPanel(state, index);
      if (media.gallery.length > mediaModel.MAX_GALLERY_ITEMS) push(errors, `Panel ${number} exceeds the gallery limit.`);
      if (media.files.length > mediaModel.MAX_FILES) push(errors, `Panel ${number} exceeds the attached-file limit.`);
      if (navText(media.thumbnail?.source) && !usableUrl(media.thumbnail.source)) push(errors, `Panel ${number} thumbnail media source is invalid.`);
      media.gallery.forEach((entry, mediaIndex) => { if (!usableUrl(entry?.source)) push(errors, `Panel ${number}, media ${mediaIndex + 1} has an invalid source.`); });
      media.files.forEach((entry, fileIndex) => { if (!usableUrl(entry?.source)) push(errors, `Panel ${number}, file ${fileIndex + 1} has an invalid source.`); });
    });
    checks.push(`${panels.length}/${MAX_PANELS} panels`, `${panels.reduce((sum, item) => sum + (Array.isArray(item?.fields) ? item.fields.length : 0), 0)} fields`);
    if (buttons.length > MAX_BUTTONS) push(errors, `Only ${MAX_BUTTONS} buttons can be deployed.`);
    const rowCounts = Array.from({ length: MAX_BUTTON_ROWS }, () => 0);
    buttons.forEach((button, index) => {
      const number = index + 1, url = navText(button?.url), action = navText(button?.action).toLowerCase();
      if (!navText(button?.label)) push(errors, `Button ${number} is missing a label.`);
      if (url && action) push(errors, `Button ${number} cannot have both a link and a bot action.`);
      if (url && !usableUrl(url)) push(errors, `Button ${number} has an invalid link.`);
      if (action && !KNOWN_ACTIONS.has(action)) push(errors, `Button ${number} uses unsupported action \`${action}\`.`);
      if (!url && !action) push(warnings, `Button ${number} has no link or action configured.`);
      if (action === 'reply' && !navText(button?.actionValue)) push(errors, `Button ${number} Reply action has no reply text.`);
      if (ROLE_ACTIONS.has(action)) { const id = navRoleId(button?.actionValue); if (!id) push(errors, `Button ${number} role action has no valid role selected.`); else { const role = interaction.guild?.roles?.cache?.get?.(id); if (!role) push(errors, `Button ${number} selected role no longer exists.`); else if (role.id === interaction.guildId || role.managed) push(errors, `Button ${number} selected role cannot be managed by a self-service button.`); else if (!role.editable) push(errors, `Button ${number} selected role is above Goliath or otherwise not editable.`); } }
      const configuredRow = Number(button?.row); if (Number.isInteger(configuredRow) && configuredRow >= 1 && configuredRow <= MAX_BUTTON_ROWS) rowCounts[configuredRow - 1] += 1;
    });
    rowCounts.forEach((count, index) => { if (count > MAX_COMPONENTS_PER_ROW) push(errors, `Button row ${index + 1} has ${count} buttons; Discord allows ${MAX_COMPONENTS_PER_ROW}.`); });
    checks.push(`${buttons.length}/${MAX_BUTTONS} buttons`);
    const unknown = unknownVariables(state); unknown.forEach((name) => push(warnings, `Variable \`{${name}}\` is not in the current helper list.`)); if (!unknown.length) checks.push('Variables recognised');
    if (state.hasUnsavedChanges) push(warnings, 'There are unsaved changes in the current builder session.');
    return { ready: errors.length === 0, errors, warnings, checks };
  }
  function getReadinessFixTarget(report) {
    const issue = String(report?.errors?.[0] || report?.warnings?.[0] || '');
    if (!issue) return { type: 'builder', label: '🛠️ Builder' };
    if (/destination channel/i.test(issue)) return { type: 'channel', label: '📢 Fix Channel' };
    const panelMatch = issue.match(/Panel\s+(\d+)/i), fieldMatch = issue.match(/field\s+(\d+)/i), buttonMatch = issue.match(/Button\s+(\d+)/i);
    if (buttonMatch || /button row/i.test(issue)) return { type: 'button', index: buttonMatch ? Math.max(0, Number(buttonMatch[1]) - 1) : null, label: '🔘 Fix Button' };
    if (panelMatch && /media|thumbnail|gallery|file|image|author icon|footer icon|author url/i.test(issue)) return { type: 'media', panelIndex: Math.max(0, Number(panelMatch[1]) - 1), label: '🖼️ Fix Media' };
    if (panelMatch && fieldMatch) return { type: 'field', panelIndex: Math.max(0, Number(panelMatch[1]) - 1), fieldIndex: Math.max(0, Number(fieldMatch[1]) - 1), label: '📋 Fix Field' };
    if (panelMatch) return { type: 'panel', panelIndex: Math.max(0, Number(panelMatch[1]) - 1), label: '🧩 Fix Panel' };
    if (/Variable/i.test(issue)) return { type: 'variables', label: '📖 Variables' };
    return { type: 'builder', label: '🛠️ Builder' };
  }
  panel.getReadinessReport = getReadinessReport;
  panel.getReadinessFixTarget = getReadinessFixTarget;
  panel.buildReadinessPanel = (interaction) => {
    const state = panel.getSession(interaction), report = getReadinessReport(interaction, state), fix = getReadinessFixTarget(report);
    const status = report.ready ? (report.warnings.length ? '🟡 Ready with warnings' : '🟢 Ready to Send') : '🔴 Not Ready';
    const lines = [`**Status:** ${status}`, `**Channel:** ${state.channelId ? `<#${state.channelId}>` : 'Not selected'}`, `**Panels:** ${state.panels?.length || 0}/${MAX_PANELS}`, `**Buttons:** ${state.buttons?.length || 0}/${MAX_BUTTONS}`, '', report.errors.length ? `### ❌ Fix before sending\n${report.errors.slice(0, 12).map((item) => `• ${item}`).join('\n')}${report.errors.length > 12 ? `\n• And ${report.errors.length - 12} more...` : ''}` : '### ✅ Required checks passed'];
    if (report.warnings.length) lines.push('', `### ⚠️ Warnings\n${report.warnings.slice(0, 8).map((item) => `• ${item}`).join('\n')}${report.warnings.length > 8 ? `\n• And ${report.warnings.length - 8} more...` : ''}`);
    if (report.checks.length) lines.push('', `### 🔎 Checked\n${report.checks.slice(0, 8).map((item) => `• ${item}`).join('\n')}`);
    const first = report.ready ? new ButtonBuilder().setCustomId('embed:readiness-refresh').setLabel('🔄 Recheck').setStyle(ButtonStyle.Secondary) : new ButtonBuilder().setCustomId('embed:readiness-fix').setLabel(fix.label).setStyle(ButtonStyle.Primary);
    const row1 = new ActionRowBuilder().addComponents(first, new ButtonBuilder().setCustomId('embed:use').setLabel('✅ Use Embed').setStyle(ButtonStyle.Success).setDisabled(!report.ready));
    const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:update-existing').setLabel('♻️ Update Existing').setStyle(ButtonStyle.Secondary).setDisabled(!report.ready), new ButtonBuilder().setCustomId('embed:test-send').setLabel('🧪 Test').setStyle(ButtonStyle.Secondary).setDisabled(!report.ready));
    const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary));
    return { embeds: [new EmbedBuilder().setColor(report.ready ? (report.warnings.length ? 0xFEE75C : 0x57F287) : 0xED4245).setTitle('✅ Embed Readiness').setDescription(lines.join('\n').slice(0, 4096)).setFooter({ text: `Requested by ${requestedBy(interaction)}` }).setTimestamp()], components: [row1, row2, row3] };
  };
  if (!panel.__readinessBuilderPatched && typeof panel.buildBuilderPanel === 'function') {
    const originalBuildBuilderPanel = panel.buildBuilderPanel.bind(panel);
    panel.buildBuilderPanel = (interaction, ...args) => { const payload = originalBuildBuilderPanel(interaction, ...args); const rows = Array.isArray(payload?.components) ? payload.components : []; let target = rows.find((row, index) => index > 0 && Array.isArray(row?.components) && row.components.length < 5); if (!target && rows.length < 5) { target = new ActionRowBuilder(); rows.push(target); } if (target && !target.components?.some?.((component) => component?.data?.custom_id === 'embed:readiness')) target.addComponents(new ButtonBuilder().setCustomId('embed:readiness').setLabel('✅ Review').setStyle(ButtonStyle.Success)); payload.components = rows.slice(0, 5); return payload; };
    panel.__readinessBuilderPatched = true;
  }
  const NAVIGATION_IDS = new Set(['admin:modules', 'embed:back', 'embed:appearance-back', 'embed:thumbnail-back', 'embed:media-options-back', 'embed:file-options-back', 'embed:button-options-back']);
  function componentId(component) { return component?.data?.custom_id || component?.customId || null; }
  function findRow(rows, id) { return rows.find((row) => Array.isArray(row?.components) && row.components.some((component) => componentId(component) === id)); }
  function findComponent(rows, id) { for (const row of rows) { const component = Array.isArray(row?.components) ? row.components.find((entry) => componentId(entry) === id) : null; if (component) return component; } return null; }
  function rowFromComponents(...components) { const safe = components.filter(Boolean).slice(0, 5); return safe.length ? new ActionRowBuilder().addComponents(...safe) : null; }
  function cloneRowWithout(row, ids = []) { if (!row || !Array.isArray(row.components)) return null; return rowFromComponents(...row.components.filter((component) => !ids.includes(componentId(component)))); }
  function normalizeNavigationLabels(payload) { const rows = Array.isArray(payload?.components) ? payload.components : [], lastRowIndex = rows.length - 1; rows.forEach((row, rowIndex) => { if (!Array.isArray(row?.components)) return; for (const component of row.components) { const id = componentId(component), isExplicitNavigation = NAVIGATION_IDS.has(id), isLastRowBuilderNavigation = id === 'embed:builder' && rowIndex === lastRowIndex; if (!isExplicitNavigation && !isLastRowBuilderNavigation) continue; if (typeof component?.setLabel === 'function') component.setLabel('⬅️ Back'); else if (component?.data) component.data.label = '⬅️ Back'; } }); return payload; }
  function wrapNavigationLabels(methodName) { if (typeof panel[methodName] !== 'function') return; const original = panel[methodName].bind(panel); panel[methodName] = (...args) => normalizeNavigationLabels(original(...args)); }
  function panelSelector(state) { const panels = Array.isArray(state?.panels) && state.panels.length ? state.panels : [{}]; return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:builder-panel-select').setPlaceholder('🧩 Select content panel').setMinValues(1).setMaxValues(1).addOptions(panels.slice(0, 25).map((entry, index) => ({ label: `${index + 1}. ${String(entry?.title || entry?.authorName || 'Content Panel').slice(0, 80)}`, value: String(index), description: String(entry?.description || entry?.color || 'Content panel').slice(0, 100), default: Number(state?.selectedPanelIndex || 0) === index })))); }
  function mainNavigationRow() { return rowFromComponents(new ButtonBuilder().setCustomId('admin:modules').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)); }
  function builderNavigationRow(rows) { return rowFromComponents(new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary), findComponent(rows, 'embed:helpers'), findComponent(rows, 'embed:reset')); }
  if (!panel.__embedNavigationPatched) {
    const originalEditor = panel.buildEditorPanel.bind(panel);
    panel.buildEditorPanel = (interaction, ...args) => { const payload = compactPreviewPayload(originalEditor(interaction, ...args), interaction), rows = Array.isArray(payload?.components) ? payload.components : [], templateRow = findRow(rows, 'embed:template'), channelRow = findRow(rows, 'embed:channel'), colorRow = findRow(rows, 'embed:color'), actionSource = findRow(rows, 'embed:builder'), actions = cloneRowWithout(actionSource, ['embed:panels']); payload.components = [templateRow, channelRow, colorRow, actions, mainNavigationRow()].filter(Boolean).slice(0, 5); return normalizeNavigationLabels(payload); };
    const originalBuilder = panel.buildBuilderPanel.bind(panel);
    panel.buildBuilderPanel = (interaction, ...args) => { const payload = compactPreviewPayload(originalBuilder(interaction, ...args), interaction), state = panel.getSession(interaction), rows = Array.isArray(payload?.components) ? payload.components : [], appearance = findComponent(rows, 'embed:edit-media'); if (appearance?.setLabel) appearance.setLabel('🎨 Appearance'); const media = findComponent(rows, 'embed:edit-images') || new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🖼️ Media').setStyle(ButtonStyle.Primary); const contextRow = panelSelector(state), buildRow = rowFromComponents(findComponent(rows, 'embed:edit-content'), findComponent(rows, 'embed:panels') || new ButtonBuilder().setCustomId('embed:panels').setLabel(`🧩 Panels (${state.panels?.length || 1})`).setStyle(ButtonStyle.Primary), appearance, media), detailRow = rowFromComponents(findComponent(rows, 'embed:fields'), findComponent(rows, 'embed:buttons'), findComponent(rows, 'embed:update-existing')), finishRow = rowFromComponents(findComponent(rows, 'embed:readiness'), findComponent(rows, 'embed:test-send'), findComponent(rows, 'embed:toggle-timestamp')); payload.components = [contextRow, buildRow, detailRow, finishRow, builderNavigationRow(rows)].filter(Boolean).slice(0, 5); return normalizeNavigationLabels(payload); };
    const originalPanels = panel.buildPanelsPanel.bind(panel);
    panel.buildPanelsPanel = (interaction, ...args) => { const payload = compactPreviewPayload(originalPanels(interaction, ...args), interaction), rows = Array.isArray(payload?.components) ? payload.components : []; payload.components = [findRow(rows, 'embed:panel-select'), rowFromComponents(findComponent(rows, 'embed:panel-add'), findComponent(rows, 'embed:panel-duplicate'), findComponent(rows, 'embed:panel-remove')), rowFromComponents(findComponent(rows, 'embed:panel-up'), findComponent(rows, 'embed:panel-down')), rowFromComponents(findComponent(rows, 'embed:builder'))].filter(Boolean); return normalizeNavigationLabels(payload); };
    if (typeof panel.buildButtonsManagerPanel === 'function') {
      const originalButtonsManager = panel.buildButtonsManagerPanel.bind(panel);
      panel.buildButtonsManagerPanel = (interaction, ...args) => { const payload = originalButtonsManager(interaction, ...args), rows = Array.isArray(payload?.components) ? payload.components : [], selector = findRow(rows, 'embed:button-manager-select'), controls = findRow(rows, 'embed:button-manager-add'), reorder = rowFromComponents(findComponent(rows, 'embed:button-manager-up'), findComponent(rows, 'embed:button-manager-down')), back = rowFromComponents(findComponent(rows, 'embed:builder')); payload.components = [selector, controls, reorder, back].filter(Boolean).slice(0, 5); return normalizeNavigationLabels(payload); };
    }
    ['buildAppearancePanel', 'buildAppearanceIconPanel', 'buildThumbnailOptionsPanel', 'buildMediaManagerPanel', 'buildMediaManager', 'buildMediaOptionsPanel', 'buildFileOptionsPanel', 'buildFieldsManagerPanel', 'buildButtonOptionsPanel', 'buildReadinessPanel'].forEach(wrapNavigationLabels);
    panel.__embedNavigationPatched = true;
  }
})();

module.exports = panel;
