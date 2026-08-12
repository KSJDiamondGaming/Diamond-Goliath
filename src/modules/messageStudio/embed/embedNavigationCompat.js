'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const panel = require('./embedReadinessCompat');

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
    findComponent(rows, 'embed:helpers'),
    new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );
}
function actionsNavigationRow() {
  return rowFromComponents(
    new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
  );
}

panel.buildActionsPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const report = typeof panel.getReadinessReport === 'function'
    ? panel.getReadinessReport(interaction, state)
    : { ready: true, warnings: [], errors: [] };
  const status = report.ready
    ? (report.warnings?.length ? '🟡 Ready with warnings' : '🟢 Ready')
    : '🔴 Needs review';

  const base = panel.buildBuilderPanel(interaction, panel.memberName(interaction));
  const rows = Array.isArray(base?.components) ? base.components : [];

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(report.ready ? (report.warnings?.length ? 0xFEE75C : 0x57F287) : 0xED4245)
        .setTitle('🚀 Embed Actions')
        .setDescription([
          `**Status:** ${status}`,
          `**Panel:** ${(Number(state.selectedPanelIndex) || 0) + 1}/${state.panels?.length || 1}`,
          '',
          'Configure delivery behaviour for this embed.',
        ].join('\n')),
    ],
    components: [
      rowFromComponents(
        findComponent(rows, 'embed:toggle-ping'),
        findComponent(rows, 'embed:toggle-timestamp'),
      ),
      actionsNavigationRow(),
    ].filter(Boolean),
  };
};

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

    const contextRow = panelSelector(state);

    const editRow = rowFromComponents(
      findComponent(rows, 'embed:edit-content'),
      findComponent(rows, 'embed:edit-appearance'),
      findComponent(rows, 'embed:fields'),
      findComponent(rows, 'embed:edit-media'),
      findComponent(rows, 'embed:buttons'),
    ) || findRow(rows, 'embed:edit-content');

    const configureRow = rowFromComponents(
      findComponent(rows, 'embed:panels') || new ButtonBuilder().setCustomId('embed:panels').setLabel(`🧩 Panels (${state.panels?.length || 1})`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('embed:actions').setLabel('🚀 Actions').setStyle(ButtonStyle.Success),
      findComponent(rows, 'embed:readiness'),
      findComponent(rows, 'embed:test-send'),
      findComponent(rows, 'embed:update-existing'),
    );

    const utilityRow = rowFromComponents(
      findComponent(rows, 'embed:reset'),
    );

    payload.components = [contextRow, editRow, configureRow, utilityRow, builderNavigationRow(rows)].filter(Boolean).slice(0, 5);
    return payload;
  };

  panel.__embedNavigationPatched = true;
}

module.exports = panel;
