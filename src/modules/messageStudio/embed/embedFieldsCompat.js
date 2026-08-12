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
const panel = require('./embedAppearanceCompat');

const MAX_FIELDS = 25;
const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}
function input(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(true)
    .setMaxLength(maxLength)
    .setValue(String(value || '').slice(0, maxLength));
}
function short(value, max = 500) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
function selectedIndex(state) {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  return Number.isInteger(state.selectedFieldIndex) && fields[state.selectedFieldIndex] ? state.selectedFieldIndex : null;
}
function resolved(value, interaction) {
  return typeof panel.replaceVars === 'function' ? panel.replaceVars(String(value || ''), interaction) : String(value || '');
}

panel.fieldEditorModal = (state, index = null) => {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  const item = Number.isInteger(index) ? (fields[index] || {}) : {};
  return new ModalBuilder()
    .setCustomId(Number.isInteger(index) ? `embed:field-manager-save:${index}` : 'embed:field-manager-save-new')
    .setTitle(Number.isInteger(index) ? 'Edit Field' : 'Add Field')
    .addComponents(
      new ActionRowBuilder().addComponents(input('name', 'Field name', TextInputStyle.Short, item.name || '', 256)),
      new ActionRowBuilder().addComponents(input('value', 'Field content', TextInputStyle.Paragraph, item.value || '', 1024)),
    );
};

panel.buildFieldsManagerPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const fields = Array.isArray(state.fields) ? state.fields : [];
  const index = selectedIndex(state);
  const item = index == null ? null : fields[index];
  const layout = ['auto', '1', '2', '3'].includes(String(state.fieldLayout)) ? String(state.fieldLayout) : 'auto';
  const lines = [
    `**Panel:** ${(Number(state.selectedPanelIndex) || 0) + 1} / ${state.panels?.length || 1}`,
    `**Fields:** ${fields.length}/${MAX_FIELDS}`,
    `**Layout:** ${layout === 'auto' ? 'Auto' : `${layout} per row`}`,
    '',
  ];
  if (item) {
    lines.push(
      `**Selected field ${index + 1}:** ${short(item.name || 'Field', 300)}`,
      `**Inline:** ${item.inline ? 'Yes' : 'No'}`,
      `**Content:** ${short(item.value || '', 900) || 'Not set'}`,
    );
  } else lines.push('**Selected field:** None');
  lines.push('', 'Field names and content support Embed Studio variables. Use Inline to allow fields to share a row; the Layout setting controls the overall row arrangement.');

  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Fields').setDescription(lines.join('\n').slice(0, 4096))];
  if (item) {
    const previewName = short(resolved(item.name, interaction), 256) || 'Field';
    const previewValue = short(resolved(item.value, interaction), 1024) || 'No content';
    embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👁️ Selected Field Preview').addFields({ name: previewName, value: previewValue, inline: Boolean(item.inline) }));
  }

  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:field-manager-layout').setPlaceholder('Field layout').setMinValues(1).setMaxValues(1).addOptions([
        { label: 'Auto', value: 'auto', description: 'Let Embed Studio arrange fields', default: layout === 'auto' },
        { label: '1 field per row', value: '1', default: layout === '1' },
        { label: '2 fields per row', value: '2', default: layout === '2' },
        { label: '3 fields per row', value: '3', default: layout === '3' },
      ]),
    ),
  ];
  if (fields.length) rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:field-manager-select').setPlaceholder('Select field').setMinValues(1).setMaxValues(1)
        .addOptions(fields.map((field, fieldIndex) => ({
          label: `${fieldIndex + 1}. ${short(field.name || 'Field', 80)}`,
          value: String(fieldIndex),
          description: short(field.value || 'No content', 100),
          default: fieldIndex === index,
        }))),
    ),
  );
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
      new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds, components: enforceLimits(rows) };
};

panel.MAX_EMBED_FIELDS = MAX_FIELDS;
module.exports = panel;
