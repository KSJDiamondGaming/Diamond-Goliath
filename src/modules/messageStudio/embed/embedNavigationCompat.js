'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const panel = require('./embedReadinessCompat');

function componentId(component) {
  return component?.data?.custom_id || component?.customId || null;
}
function findRow(rows, id) {
  return rows.find((row) => Array.isArray(row?.components) && row.components.some((component) => componentId(component) === id));
}
function cloneRowWithout(row, ids = []) {
  if (!row || !Array.isArray(row.components)) return null;
  const kept = row.components.filter((component) => !ids.includes(componentId(component)));
  if (!kept.length) return null;
  return new ActionRowBuilder().addComponents(...kept);
}
function panelSelector(state) {
  const panels = Array.isArray(state?.panels) && state.panels.length ? state.panels : [{}];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('embed:builder-panel-select')
      .setPlaceholder('🧩 Select content panel')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(panels.slice(0, 25).map((entry, index) => ({
        label: `${index + 1}. ${String(entry?.title || entry?.authorName || 'Content Panel').slice(0, 80)}`,
        value: String(index),
        description: String(entry?.description || entry?.color || 'Content panel').slice(0, 100),
        default: Number(state?.selectedPanelIndex || 0) === index,
      }))),
  );
}
function mainNavigationRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin:modules').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );
}
function builderNavigationRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );
}

if (!panel.__embedNavigationPatched) {
  const originalEditor = panel.buildEditorPanel.bind(panel);
  panel.buildEditorPanel = (interaction, ...args) => {
    const payload = originalEditor(interaction, ...args);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    const templateRow = findRow(rows, 'embed:template');
    const channelRow = findRow(rows, 'embed:channel');
    const colorRow = findRow(rows, 'embed:color');
    const actionSource = findRow(rows, 'embed:builder');
    const actions = cloneRowWithout(actionSource, ['embed:panels']);
    payload.components = [templateRow, channelRow, colorRow, actions, mainNavigationRow()].filter(Boolean).slice(0, 5);
    return payload;
  };

  const originalBuilder = panel.buildBuilderPanel.bind(panel);
  panel.buildBuilderPanel = (interaction, ...args) => {
    const payload = originalBuilder(interaction, ...args);
    const state = panel.getSession(interaction);
    const rows = Array.isArray(payload?.components) ? payload.components : [];

    const editRow = findRow(rows, 'embed:edit-content');
    const toggleRowSource = findRow(rows, 'embed:toggle-ping');
    const deliveryRowSource = findRow(rows, 'embed:test-send');

    const toggleComponents = Array.isArray(toggleRowSource?.components) ? [...toggleRowSource.components] : [];
    const hasPanels = toggleComponents.some((component) => componentId(component) === 'embed:panels');
    if (!hasPanels) toggleComponents.unshift(
      new ButtonBuilder().setCustomId('embed:panels').setLabel(`🧩 Panels (${state.panels?.length || 1})`).setStyle(ButtonStyle.Primary),
    );
    if (!toggleComponents.some((component) => componentId(component) === 'embed:readiness')) {
      toggleComponents.push(new ButtonBuilder().setCustomId('embed:readiness').setLabel('✅ Review').setStyle(ButtonStyle.Success));
    }
    const controls = new ActionRowBuilder().addComponents(...toggleComponents.slice(0, 5));

    const delivery = cloneRowWithout(deliveryRowSource, ['embed:back']);
    payload.components = [panelSelector(state), editRow, controls, delivery, builderNavigationRow()].filter(Boolean).slice(0, 5);
    return payload;
  };

  panel.__embedNavigationPatched = true;
}

module.exports = panel;
