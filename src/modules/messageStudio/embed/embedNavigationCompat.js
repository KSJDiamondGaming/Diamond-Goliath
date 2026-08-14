'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const panel = require('./embedReadinessCompat');

const NAVIGATION_IDS = new Set([
  'admin:modules',
  'embed:back',
  'embed:appearance-back',
  'embed:thumbnail-back',
  'embed:media-options-back',
  'embed:file-options-back',
  'embed:button-options-back',
]);

function componentId(component) {
  return component?.data?.custom_id || component?.customId || null;
}
function findRow(rows, id) {
  return rows.find((row) => Array.isArray(row?.components) && row.components.some((component) => componentId(component) === id));
}
function findComponent(rows, id) {
  for (const row of rows) {
    const component = Array.isArray(row?.components)
      ? row.components.find((entry) => componentId(entry) === id)
      : null;
    if (component) return component;
  }
  return null;
}
function rowFromComponents(...components) {
  const safe = components.filter(Boolean).slice(0, 5);
  return safe.length ? new ActionRowBuilder().addComponents(...safe) : null;
}
function cloneRowWithout(row, ids = []) {
  if (!row || !Array.isArray(row.components)) return null;
  const kept = row.components.filter((component) => !ids.includes(componentId(component)));
  return rowFromComponents(...kept);
}
function normalizeNavigationLabels(payload) {
  const rows = Array.isArray(payload?.components) ? payload.components : [];
  const lastRowIndex = rows.length - 1;
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row?.components)) return;
    for (const component of row.components) {
      const id = componentId(component);
      const isExplicitNavigation = NAVIGATION_IDS.has(id);
      const isLastRowBuilderNavigation = id === 'embed:builder' && rowIndex === lastRowIndex;
      if (!isExplicitNavigation && !isLastRowBuilderNavigation) continue;
      if (typeof component?.setLabel === 'function') component.setLabel('⬅️ Back');
      else if (component?.data) component.data.label = '⬅️ Back';
    }
  });
  return payload;
}
function wrapNavigationLabels(methodName) {
  if (typeof panel[methodName] !== 'function') return;
  const original = panel[methodName].bind(panel);
  panel[methodName] = (...args) => normalizeNavigationLabels(original(...args));
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
  return rowFromComponents(
    new ButtonBuilder().setCustomId('admin:modules').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );
}
function builderNavigationRow(rows) {
  return rowFromComponents(
    new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    findComponent(rows, 'embed:helpers'),
    findComponent(rows, 'embed:reset'),
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
    return normalizeNavigationLabels(payload);
  };

  const originalBuilder = panel.buildBuilderPanel.bind(panel);
  panel.buildBuilderPanel = (interaction, ...args) => {
    const payload = originalBuilder(interaction, ...args);
    const state = panel.getSession(interaction);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    const contextRow = panelSelector(state);
    const buildRow = rowFromComponents(
      findComponent(rows, 'embed:edit-content'),
      findComponent(rows, 'embed:panels') || new ButtonBuilder().setCustomId('embed:panels').setLabel(`🧩 Panels (${state.panels?.length || 1})`).setStyle(ButtonStyle.Primary),
      findComponent(rows, 'embed:edit-media'),
      findComponent(rows, 'embed:edit-images'),
    );
    const detailRow = rowFromComponents(
      findComponent(rows, 'embed:fields'),
      findComponent(rows, 'embed:buttons'),
      findComponent(rows, 'embed:update-existing'),
    );
    const finishRow = rowFromComponents(
      findComponent(rows, 'embed:readiness'),
      findComponent(rows, 'embed:test-send'),
    );
    payload.components = [contextRow, buildRow, detailRow, finishRow, builderNavigationRow(rows)].filter(Boolean).slice(0, 5);
    return normalizeNavigationLabels(payload);
  };

  const originalPanels = panel.buildPanelsPanel.bind(panel);
  panel.buildPanelsPanel = (interaction, ...args) => {
    const payload = originalPanels(interaction, ...args);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    payload.components = [
      findRow(rows, 'embed:panel-select'),
      rowFromComponents(
        findComponent(rows, 'embed:panel-add'),
        findComponent(rows, 'embed:panel-duplicate'),
        findComponent(rows, 'embed:panel-remove'),
      ),
      rowFromComponents(
        findComponent(rows, 'embed:panel-up'),
        findComponent(rows, 'embed:panel-down'),
      ),
      rowFromComponents(findComponent(rows, 'embed:builder')),
    ].filter(Boolean);
    return normalizeNavigationLabels(payload);
  };

  if (typeof panel.buildButtonsManagerPanel === 'function') {
    const originalButtonsManager = panel.buildButtonsManagerPanel.bind(panel);
    panel.buildButtonsManagerPanel = (interaction, ...args) => {
      const payload = originalButtonsManager(interaction, ...args);
      const rows = Array.isArray(payload?.components) ? payload.components : [];
      const selector = findRow(rows, 'embed:button-manager-select');
      const controls = findRow(rows, 'embed:button-manager-add');
      const reorder = rowFromComponents(
        findComponent(rows, 'embed:button-manager-up'),
        findComponent(rows, 'embed:button-manager-down'),
      );
      const back = rowFromComponents(findComponent(rows, 'embed:builder'));
      payload.components = [selector, controls, reorder, back].filter(Boolean).slice(0, 5);
      return normalizeNavigationLabels(payload);
    };
  }

  [
    'buildAppearancePanel',
    'buildAppearanceIconPanel',
    'buildThumbnailOptionsPanel',
    'buildMediaManagerPanel',
    'buildMediaManager',
    'buildMediaOptionsPanel',
    'buildFileOptionsPanel',
    'buildFieldsManagerPanel',
    'buildButtonOptionsPanel',
    'buildReadinessPanel',
  ].forEach(wrapNavigationLabels);

  panel.__embedNavigationPatched = true;
}

module.exports = panel;
