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
const panel = require('./embedFieldsCompat');

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
function input(id, label, value = '', maxLength = 4000, required = false, style = TextInputStyle.Short) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));
}
function short(value, max = 500) { const text = String(value || ''); return text.length > max ? `${text.slice(0, max - 3)}...` : text; }
function selectedIndex(state) { const buttons = Array.isArray(state.buttons) ? state.buttons : []; return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null; }
function normalizedStyle(value) { const style = String(value || 'primary').toLowerCase(); return ['primary', 'secondary', 'success', 'danger'].includes(style) ? style : 'primary'; }
function styleLabel(style) { return { primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger' }[normalizedStyle(style)]; }
function actionLabel(action) {
  return {
    reply: 'Reply',
    'toggle-role': 'Toggle Role',
    'add-role': 'Add Role',
    'remove-role': 'Remove Role',
    'user-info': 'User Info',
    'server-info': 'Server Info',
  }[String(action || '').toLowerCase()] || 'None';
}
function resolved(value, interaction) { return typeof panel.replaceVars === 'function' && interaction ? panel.replaceVars(String(value || ''), interaction) : String(value || ''); }
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

panel.buttonRows = (state, interaction = null) => {
  const rows = [];
  const buttons = (Array.isArray(state?.buttons) ? state.buttons : []).slice(0, MAX_BUTTONS);
  for (let start = 0; start < buttons.length && rows.length < MAX_DEPLOYED_BUTTON_ROWS; start += MAX_COMPONENTS_PER_ROW) {
    const row = new ActionRowBuilder();
    buttons.slice(start, start + MAX_COMPONENTS_PER_ROW).forEach((button, offset) => {
      const label = short(resolved(button?.label || 'Button', interaction), 80) || 'Button';
      const url = resolveUrl(button?.url, interaction);
      const builder = new ButtonBuilder().setLabel(label);
      if (button?.emoji) builder.setEmoji(button.emoji);
      if (url) builder.setStyle(ButtonStyle.Link).setURL(url);
      else builder.setStyle(styleValue(button?.style)).setCustomId(actionId(button, start + offset));
      row.addComponents(builder);
    });
    rows.push(row);
  }
  return rows;
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
  return new ModalBuilder()
    .setCustomId('embed:button-reply-save')
    .setTitle('Button Reply Text')
    .addComponents(new ActionRowBuilder().addComponents(input('replyText', 'Reply text / variables', item.actionValue || '', 1000, true, TextInputStyle.Paragraph)));
};

panel.buildButtonOptionsPanel = (interaction) => {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state);
  if (index == null) return panel.buildButtonsManagerPanel(interaction);
  const item = buttons[index], style = normalizedStyle(item.style);
  const action = String(item.action || '').toLowerCase();
  const currentAction = BUILT_IN_ACTIONS.includes(action) ? action : 'none';
  const destination = item.url ? `Link: ${short(item.url, 800)}` : action ? `Action: ${actionLabel(action)}${BUILT_IN_ACTIONS.includes(action) ? '' : ' (unsupported legacy action)'}` : 'No destination configured';
  const details = [
    `**Button:** ${index + 1} / ${buttons.length}`,
    `**Label:** ${item.label || 'Button'}`,
    `**Style:** ${styleLabel(style)}`,
    `**Destination:** ${destination}`,
  ];
  if (ROLE_ACTIONS.has(action)) details.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
  if (action === 'reply') details.push(`**Reply:** ${item.actionValue ? short(resolved(item.actionValue, interaction), 900) : 'Not configured'}`);
  details.push('', 'Choose an action from the menu. Role actions use Discord’s role picker, so role IDs never need to be typed manually. Link buttons are configured from Edit Button.');

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-style:primary').setLabel('🔵 Primary').setStyle(style === 'primary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:secondary').setLabel('⚪ Secondary').setStyle(style === 'secondary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:success').setLabel('🟢 Success').setStyle(style === 'success' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:button-style:danger').setLabel('🔴 Danger').setStyle(style === 'danger' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:button-action-select').setPlaceholder('Choose button action').setMinValues(1).setMaxValues(1).addOptions([
        { label: 'No Action / Link', value: 'none', description: 'Use no bot action; optionally configure a link', default: currentAction === 'none' },
        { label: 'Reply', value: 'reply', description: 'Send the clicker an ephemeral reply', default: currentAction === 'reply' },
        { label: 'Toggle Role', value: 'toggle-role', description: 'Add or remove the selected role', default: currentAction === 'toggle-role' },
        { label: 'Add Role', value: 'add-role', description: 'Give the selected role', default: currentAction === 'add-role' },
        { label: 'Remove Role', value: 'remove-role', description: 'Remove the selected role', default: currentAction === 'remove-role' },
        { label: 'User Info', value: 'user-info', description: 'Show the clicker their Discord information', default: currentAction === 'user-info' },
        { label: 'Server Info', value: 'server-info', description: 'Show information about this server', default: currentAction === 'server-info' },
      ]),
    ),
  ];
  if (ROLE_ACTIONS.has(action)) {
    rows.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('embed:button-action-role').setPlaceholder('Select role for this button').setMinValues(1).setMaxValues(1),
    ));
  } else if (action === 'reply') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-reply-edit').setLabel('✏️ Reply Text').setStyle(ButtonStyle.Primary),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('embed:button-options-back').setLabel('⬅️ Buttons').setStyle(ButtonStyle.Secondary)));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Button Options').setDescription(details.join('\n').slice(0, 4096))], components: enforceLimits(rows) };
};

panel.buildButtonsManagerPanel = (interaction) => {
  const state = panel.getSession(interaction), buttons = Array.isArray(state.buttons) ? state.buttons : [], index = selectedIndex(state), item = index == null ? null : buttons[index];
  const lines = [`**Buttons:** ${buttons.length}/${MAX_BUTTONS}`, `**Rows used when deployed:** ${buttons.length ? Math.ceil(buttons.length / MAX_COMPONENTS_PER_ROW) : 0}/${MAX_DEPLOYED_BUTTON_ROWS}`, ''];
  if (item) {
    const destination = item.url ? `Link: ${short(item.url, 1000)}` : item.action ? `Action: ${actionLabel(item.action)}` : 'No destination configured';
    lines.push(`**Selected button ${index + 1}:** ${item.emoji ? `${item.emoji} ` : ''}${item.label || 'Button'}`, `**Style:** ${styleLabel(item.style)}`, `**Destination:** ${destination}`);
    if (ROLE_ACTIONS.has(String(item.action || '').toLowerCase())) lines.push(`**Role:** ${roleDisplay(interaction, item.actionValue)}`);
    if (item.action === 'reply' && item.actionValue) lines.push(`**Reply:** ${short(resolved(item.actionValue, interaction), 900)}`);
  } else lines.push('**Selected button:** None');
  lines.push('', 'Buttons deploy in rows of up to 5, with a maximum of 20 buttons across 4 button rows. Use Edit for label/emoji/link, then Options for style and bot actions.');
  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('🔘 Buttons').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) {
    const previewLabel = short(resolved(item.label || 'Button', interaction), 80) || 'Button';
    const previewUrl = resolveUrl(item.url, interaction);
    embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Button Preview').setDescription([
      `**Label:** ${item.emoji ? `${item.emoji} ` : ''}${previewLabel}`,
      `**Style:** ${previewUrl ? 'Link' : styleLabel(item.style)}`,
      `**Destination:** ${previewUrl ? previewUrl : item.action ? `Action: ${actionLabel(item.action)}` : 'Not configured'}`,
    ].join('\n').slice(0, 4096)));
  }
  const rows = [];
  if (buttons.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:button-manager-select').setPlaceholder('Select button').setMinValues(1).setMaxValues(1).addOptions(buttons.map((button, buttonIndex) => ({ label: `${buttonIndex + 1}. ${short(button.label || 'Button', 80)}`, value: String(buttonIndex), description: short(button.url || actionLabel(button.action) || styleLabel(button.style), 100), default: buttonIndex === index })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:button-manager-add').setLabel('➕ Add').setStyle(ButtonStyle.Success).setDisabled(buttons.length >= MAX_BUTTONS),
    new ButtonBuilder().setCustomId('embed:button-manager-edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Primary).setDisabled(index == null),
    new ButtonBuilder().setCustomId('embed:button-manager-options').setLabel('⚙️ Options').setStyle(ButtonStyle.Secondary).setDisabled(index == null),
    new ButtonBuilder().setCustomId('embed:button-manager-remove').setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger).setDisabled(index == null),
  ), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:button-manager-up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index <= 0),
    new ButtonBuilder().setCustomId('embed:button-manager-down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary).setDisabled(index == null || index >= buttons.length - 1),
    new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds, components: enforceLimits(rows) };
};

panel.MAX_EMBED_BUTTONS = MAX_BUTTONS;
panel.MAX_BUTTONS_PER_ROW = MAX_COMPONENTS_PER_ROW;
panel.MAX_DEPLOYED_BUTTON_ROWS = MAX_DEPLOYED_BUTTON_ROWS;
panel.EMBED_BUTTON_ACTIONS = BUILT_IN_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = ROLE_ACTIONS;
module.exports = panel;
