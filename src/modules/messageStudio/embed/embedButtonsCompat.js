'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedFieldsCompat');

const MAX_BUTTONS = 20;
const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}
function input(id, label, value = '', maxLength = 4000, required = false) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(maxLength)
    .setValue(String(value || '').slice(0, maxLength));
}
function short(value, max = 500) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
function selectedIndex(state) {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null;
}
function normalizedStyle(value) {
  const style = String(value || 'primary').toLowerCase();
  return ['primary', 'secondary', 'success', 'danger'].includes(style) ? style : 'primary';
}
function styleLabel(style) {
  return { primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger' }[normalizedStyle(style)];
}
function resolved(value, interaction) {
  return typeof panel.replaceVars === 'function' ? panel.replaceVars(String(value || ''), interaction) : String(value || '');
}
function resolveUrl(value, interaction) {
  const raw = resolved(value, interaction).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

panel.buttonEditorModal = (state, index = null) => {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const item = Number.isInteger(index) ? (buttons[index] || {}) : {};
  return new ModalBuilder()
    .setCustomId(Number.isInteger(index) ? `embed:button-manager-save:${index}` : 'embed:button-manager-save-new')
    .setTitle(Number.isInteger(index) ? 'Edit Button' : 'Add Button')
    .addComponents(
      new ActionRowBuilder().addComponents(input('label', 'Button label', item.label || '', 80, true)),
      new ActionRowBuilder().addComponents(input('emoji', 'Emoji (optional)', item.emoji || '', 100, false)),
      new ActionRowBuilder().addComponents(input('url', 'Link URL / variable (optional)', item.url || '', 4000, false)),
      new ActionRowBuilder().addComponents(input('action', 'Custom action name (advanced)', item.action || '', 80, false)),
    );
};

panel.buildButtonOptionsPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const index = selectedIndex(state);
  if (index == null) return panel.buildButtonsManagerPanel(interaction);
  const item = buttons[index];
  const style = normalizedStyle(item.style);
  const destination = item.url ? `Link: ${short(item.url, 800)}` : item.action ? `Action: ${short(item.action, 300)}` : 'No destination configured';
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Button Options').setDescription([
      `**Button:** ${index + 1} / ${buttons.length}`,
      `**Label:** ${item.label || 'Button'}`,
      `**Style:** ${styleLabel(style)}`,
      `**Destination:** ${destination}`,
      '',
      'Choose the Discord button style below. Link buttons automatically use Discord’s Link style when a valid URL is configured.',
    ].join('\n').slice(0, 4096))],
    components: enforceLimits([
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embed:button-style:primary').setLabel('🔵 Primary').setStyle(style === 'primary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embed:button-style:secondary').setLabel('⚪ Secondary').setStyle(style === 'secondary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embed:button-style:success').setLabel('🟢 Success').setStyle(style === 'success' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embed:button-style:danger').setLabel('🔴 Danger').setStyle(style === 'danger' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embed:button-options-back').setLabel('⬅️ Buttons').setStyle(ButtonStyle.Secondary),
      ),
    ]),
  };
};

panel.buildButtonsManagerPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  const index = selectedIndex(state);
  const item = index == null ? null : buttons[index];
  const lines = [
    `**Buttons:** ${buttons.length}/${MAX_BUTTONS}`,
    `**Rows used when deployed:** ${buttons.length ? Math.ceil(buttons.length / MAX_COMPONENTS_PER_ROW) : 0}/4`,
    '',
  ];
  if (item) {
    const destination = item.url ? `Link: ${short(item.url, 1000)}` : item.action ? `Action: ${short(item.action, 500)}` : 'No destination configured';
    lines.push(
      `**Selected button ${index + 1}:** ${item.emoji ? `${item.emoji} ` : ''}${item.label || 'Button'}`,
      `**Style:** ${styleLabel(item.style)}`,
      `**Destination:** ${destination}`,
    );
  } else lines.push('**Selected button:** None');
  lines.push('', 'Buttons are deployed in rows of up to 5. Embed Studio caps this editor at 20 buttons so button rows remain within Discord limits. Labels and link URLs support variables.');

  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('🔘 Buttons').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) {
    const previewLabel = short(resolved(item.label || 'Button', interaction), 80) || 'Button';
    const previewUrl = resolveUrl(item.url, interaction);
    const preview = new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Button Preview').setDescription([
      `**Label:** ${item.emoji ? `${item.emoji} ` : ''}${previewLabel}`,
      `**Style:** ${previewUrl ? 'Link' : styleLabel(item.style)}`,
      `**Destination:** ${previewUrl ? previewUrl : item.action ? `Custom action: ${item.action}` : 'Not configured'}`,
    ].join('\n').slice(0, 4096));
    embeds.push(preview);
  }

  const rows = [];
  if (buttons.length) rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:button-manager-select').setPlaceholder('Select button').setMinValues(1).setMaxValues(1)
        .addOptions(buttons.map((button, buttonIndex) => ({
          label: `${buttonIndex + 1}. ${short(button.label || 'Button', 80)}`,
          value: String(buttonIndex),
          description: short(button.url || button.action || styleLabel(button.style), 100),
          default: buttonIndex === index,
        }))),
    ),
  );
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:button-manager-add').setLabel('➕ Add').setStyle(ButtonStyle.Success).setDisabled(buttons.length >= MAX_BUTTONS),
      new ButtonBuilder().setCustomId('embed:button-manager-edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Primary).setDisabled(index == null),
      new ButtonBuilder().setCustomId('embed:button-manager-options').setLabel('⚙️ Style').setStyle(ButtonStyle.Secondary).setDisabled(index == null),
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
module.exports = panel;
