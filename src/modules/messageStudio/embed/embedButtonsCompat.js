'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedPanel');

const MAX_FIELDS = 25;
const MAX_BUTTONS = 20;
const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;
const MAX_DEPLOYED_BUTTON_ROWS = 4;
const BUILT_IN_ACTIONS = Object.freeze(['reply', 'toggle-role', 'add-role', 'remove-role', 'user-info', 'server-info']);
const ROLE_ACTIONS = new Set(['toggle-role', 'add-role', 'remove-role']);

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}
function short(value, max = 500) { const text = String(value || ''); return text.length > max ? `${text.slice(0, max - 3)}...` : text; }
function resolved(value, interaction) { return typeof panel.replaceVars === 'function' && interaction ? panel.replaceVars(String(value || ''), interaction) : String(value || ''); }

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
function actionLabel(action) {
  return { reply: 'Reply', 'toggle-role': 'Toggle Role', 'add-role': 'Add Role', 'remove-role': 'Remove Role', 'user-info': 'User Info', 'server-info': 'Server Info' }[String(action || '').toLowerCase()] || 'None';
}
function normalizedRow(value) {
  if (value === '' || value == null || value === 'auto') return null;
  const row = Number(value);
  return Number.isInteger(row) && row >= 0 && row < MAX_DEPLOYED_BUTTON_ROWS ? row : null;
}
function rowLabel(value) { const row = normalizedRow(value); return row == null ? 'Auto' : `Row ${row + 1}`; }
function resolveUrl(value, interaction) { const raw = resolved(value, interaction).trim(); if (!raw) return ''; try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; } }
function styleValue(style) { return { secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger }[normalizedStyle(style)] || ButtonStyle.Primary; }
function actionId(button, absoluteIndex) {
  if (button?.id) return String(button.id).trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 100);
  return `embed:action:${absoluteIndex}`;
}
function roleDisplay(interaction, roleId) {
  const role = interaction?.guild?.roles?.cache?.get?.(String(roleId || '').replace(/\D/g, ''));
  return role ? `<@&${role.id}>` : roleId ? `Role ${roleId}` : 'Not selected';
}
function layoutButtons(buttons = []) {
  const rows = Array.from({ length: MAX_DEPLOYED_BUTTON_ROWS }, () => []);
  const automatic = [];
  buttons.slice(0, MAX_BUTTONS).forEach((button, index) => {
    const row = normalizedRow(button?.row);
    if (row != null && rows[row].length < MAX_COMPONENTS_PER_ROW) rows[row].push({ button, index });
    else automatic.push({ button, index });
  });
  for (const entry of automatic) {
    const target = rows.findIndex((row) => row.length < MAX_COMPONENTS_PER_ROW);
    if (target < 0) break;
    rows[target].push(entry);
  }
  return rows;
}
function deployedRowFor(buttons, index) {
  const rows = layoutButtons(buttons);
  const row = rows.findIndex((entries) => entries.some((entry) => entry.index === index));
  return row >= 0 ? row : null;
}

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
panel.buttonReplyModal = (state) => {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const index = selectedIndex(state);
  const item = index == null ? {} : (buttons[index] || {});
  return new ModalBuilder().setCustomId('embed:button-reply-save').setTitle('Button Reply Text').addComponents(new ActionRowBuilder().addComponents(input('replyText', 'Reply text / variables', item.actionValue || '', 1000, true, TextInputStyle.Paragraph)));
};

panel.buildButtonOptionsPanel = (interaction) => {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state);
  if (index == null) return panel.buildButtonsManagerPanel(interaction);
  const item = buttons[index], style = normalizedStyle(item.style);
  const action = String(item.action || '').toLowerCase();
  const currentAction = BUILT_IN_ACTIONS.includes(action) ? action : 'none';
  const configuredRow = normalizedRow(item.row);
  const actualRow = deployedRowFor(buttons, index);
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
  const layout = layoutButtons(buttons);
  const usedRows = layout.filter((row) => row.length).length;
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
    const previewLabel = short(resolved(item.label || 'Button', interaction), 80) || 'Button';
    const previewUrl = resolveUrl(item.url, interaction);
    const actualRow = deployedRowFor(buttons, index);
    embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Button Preview').setDescription([
      `**Label:** ${item.emoji ? `${item.emoji} ` : ''}${previewLabel}`,
      `**Style:** ${previewUrl ? 'Link' : styleLabel(item.style)}`,
      `**Destination:** ${previewUrl ? previewUrl : item.action ? `Action: ${actionLabel(item.action)}` : 'Not configured'}`,
      `**Deploy row:** ${actualRow == null ? 'Not placed' : actualRow + 1}`,
    ].join('\n').slice(0, 4096)));
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

panel.MAX_EMBED_BUTTONS = MAX_BUTTONS;
panel.MAX_BUTTONS_PER_ROW = MAX_COMPONENTS_PER_ROW;
panel.MAX_DEPLOYED_BUTTON_ROWS = MAX_DEPLOYED_BUTTON_ROWS;
panel.EMBED_BUTTON_ACTIONS = BUILT_IN_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = ROLE_ACTIONS;
panel.layoutEmbedButtons = layoutButtons;
panel.embedButtonRow = normalizedRow;
module.exports = panel;
