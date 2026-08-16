'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const panel = require('./embedButtonsCompat');
const { mediaModel } = require('./embedMedia');

const ROLE_ACTIONS = new Set(['toggle-role', 'add-role', 'remove-role']);
const KNOWN_ACTIONS = new Set(['reply', 'toggle-role', 'add-role', 'remove-role', 'user-info', 'server-info']);
const MAX_PANELS = 10;
const MAX_FIELDS = 25;
const MAX_BUTTONS = 20;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_BUTTON_ROWS = 4;

function text(value) { return String(value ?? '').trim(); }
function hasVariable(value) { return /\{[a-zA-Z0-9_]+\}/.test(String(value || '')); }
function usableUrl(value) { const raw = text(value); if (!raw) return true; if (hasVariable(raw)) return true; try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
function roleId(value) { const id = text(value).replace(/[<@&>]/g, ''); return /^\d{15,25}$/.test(id) ? id : null; }
function requestedBy(interaction) { return panel.memberName?.(interaction) || interaction.member?.displayName || interaction.user?.username || 'Unknown User'; }
function compactPreviewPayload(payload, interaction) {
  if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 2) return payload;
  const state = panel.getSession(interaction);
  const selectedIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0);
  const selectedPreview = payload.embeds[selectedIndex + 1] || payload.embeds[1];
  return { ...payload, embeds: selectedPreview ? [payload.embeds[0], selectedPreview] : [payload.embeds[0]] };
}
function push(list, message) { if (!list.includes(message)) list.push(message); }
function fieldText(panelData = {}) { return [panelData.title, panelData.description, panelData.authorName, panelData.authorIcon, panelData.authorUrl, panelData.footer, panelData.footerIcon, panelData.image, panelData.thumbnail, ...(Array.isArray(panelData.fields) ? panelData.fields.flatMap((field) => [field?.name, field?.value]) : [])].filter(Boolean).join('\n'); }
function unknownVariables(state) { const source = [...(Array.isArray(state.panels) ? state.panels.map(fieldText) : []), ...(Array.isArray(state.buttons) ? state.buttons.flatMap((button) => [button?.label, button?.url, button?.actionValue]) : [])].join('\n'); const found = [...source.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]); const known = new Set((Array.isArray(panel.HELPERS) ? panel.HELPERS : []).map((item) => String(item).replace(/[{}]/g, '').toLowerCase())); if (!known.size) return []; return [...new Set(found.filter((name) => !known.has(name.toLowerCase())))]; }

function getReadinessReport(interaction, state = panel.getSession(interaction)) {
  const errors = [], warnings = [], checks = [];
  const panels = Array.isArray(state.panels) ? state.panels : [];
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  if (!state.channelId) push(errors, 'Choose a destination channel.'); else checks.push('Destination channel selected');
  if (!panels.length) push(errors, 'At least one content panel is required.');
  if (panels.length > MAX_PANELS) push(errors, `Only ${MAX_PANELS} panels can be used.`);
  panels.forEach((item, index) => {
    const number = index + 1, fields = Array.isArray(item?.fields) ? item.fields : [];
    const hasContent = [item?.title, item?.description, item?.authorName, item?.footer, item?.image, item?.thumbnail].some((value) => text(value)) || fields.some((field) => text(field?.name) || text(field?.value));
    if (!hasContent) push(warnings, `Panel ${number} is empty.`);
    if (fields.length > MAX_FIELDS) push(errors, `Panel ${number} exceeds the ${MAX_FIELDS}-field limit.`);
    fields.forEach((field, fieldIndex) => { if (!text(field?.name)) push(errors, `Panel ${number}, field ${fieldIndex + 1} is missing a name.`); if (!text(field?.value)) push(errors, `Panel ${number}, field ${fieldIndex + 1} is missing content.`); });
    [['Author icon', item?.authorIcon], ['Author URL', item?.authorUrl], ['Footer icon', item?.footerIcon], ['Thumbnail', item?.thumbnail], ['Image', item?.image]].forEach(([label, value]) => { if (text(value) && !usableUrl(value)) push(errors, `Panel ${number} ${label.toLowerCase()} is not a valid URL or variable.`); });
    const media = mediaModel.mediaForPanel(state, index);
    if (media.gallery.length > mediaModel.MAX_GALLERY_ITEMS) push(errors, `Panel ${number} exceeds the gallery limit.`);
    if (media.files.length > mediaModel.MAX_FILES) push(errors, `Panel ${number} exceeds the attached-file limit.`);
    if (text(media.thumbnail?.source) && !usableUrl(media.thumbnail.source)) push(errors, `Panel ${number} thumbnail media source is invalid.`);
    media.gallery.forEach((entry, mediaIndex) => { if (!usableUrl(entry?.source)) push(errors, `Panel ${number}, media ${mediaIndex + 1} has an invalid source.`); });
    media.files.forEach((entry, fileIndex) => { if (!usableUrl(entry?.source)) push(errors, `Panel ${number}, file ${fileIndex + 1} has an invalid source.`); });
  });
  checks.push(`${panels.length}/${MAX_PANELS} panels`, `${panels.reduce((sum, item) => sum + (Array.isArray(item?.fields) ? item.fields.length : 0), 0)} fields`);
  if (buttons.length > MAX_BUTTONS) push(errors, `Only ${MAX_BUTTONS} buttons can be deployed.`);
  const rowCounts = [0, 0, 0, 0];
  buttons.forEach((button, index) => {
    const number = index + 1; if (!text(button?.label)) push(errors, `Button ${number} is missing a label.`);
    const url = text(button?.url), action = text(button?.action).toLowerCase();
    if (url && action) push(errors, `Button ${number} cannot have both a link and a bot action.`);
    if (url && !usableUrl(url)) push(errors, `Button ${number} has an invalid link.`);
    if (action && !KNOWN_ACTIONS.has(action)) push(errors, `Button ${number} uses unsupported action \`${action}\`.`);
    if (!url && !action) push(warnings, `Button ${number} has no link or action configured.`);
    if (action === 'reply' && !text(button?.actionValue)) push(errors, `Button ${number} Reply action has no reply text.`);
    if (ROLE_ACTIONS.has(action)) { const id = roleId(button?.actionValue); if (!id) push(errors, `Button ${number} role action has no valid role selected.`); else { const role = interaction.guild?.roles?.cache?.get?.(id); if (!role) push(errors, `Button ${number} selected role no longer exists.`); else if (role.id === interaction.guildId || role.managed) push(errors, `Button ${number} selected role cannot be managed by a self-service button.`); else if (!role.editable) push(errors, `Button ${number} selected role is above Goliath or otherwise not editable.`); } }
    const configuredRow = Number(button?.row); if (Number.isInteger(configuredRow) && configuredRow >= 1 && configuredRow <= MAX_BUTTON_ROWS) rowCounts[configuredRow - 1] += 1;
  });
  rowCounts.forEach((count, index) => { if (count > MAX_BUTTONS_PER_ROW) push(errors, `Button row ${index + 1} has ${count} buttons; Discord allows ${MAX_BUTTONS_PER_ROW}.`); });
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

const NAVIGATION_IDS = new Set([
  'admin:modules',
  'embed:back',
  'embed:appearance-back',
  'embed:thumbnail-back',
  'embed:media-options-back',
  'embed:file-options-back',
  'embed:button-options-back',
]);

function componentId(component) { return component?.data?.custom_id || component?.customId || null; }
function findRow(rows, id) { return rows.find((row) => Array.isArray(row?.components) && row.components.some((component) => componentId(component) === id)); }
function findComponent(rows, id) {
  for (const row of rows) {
    const component = Array.isArray(row?.components) ? row.components.find((entry) => componentId(entry) === id) : null;
    if (component) return component;
  }
  return null;
}
function rowFromComponents(...components) { const safe = components.filter(Boolean).slice(0, 5); return safe.length ? new ActionRowBuilder().addComponents(...safe) : null; }
function cloneRowWithout(row, ids = []) { if (!row || !Array.isArray(row.components)) return null; return rowFromComponents(...row.components.filter((component) => !ids.includes(componentId(component)))); }
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
    new StringSelectMenuBuilder().setCustomId('embed:builder-panel-select').setPlaceholder('🧩 Select content panel').setMinValues(1).setMaxValues(1).addOptions(panels.slice(0, 25).map((entry, index) => ({
      label: `${index + 1}. ${String(entry?.title || entry?.authorName || 'Content Panel').slice(0, 80)}`,
      value: String(index),
      description: String(entry?.description || entry?.color || 'Content panel').slice(0, 100),
      default: Number(state?.selectedPanelIndex || 0) === index,
    }))),
  );
}
function mainNavigationRow() { return rowFromComponents(new ButtonBuilder().setCustomId('admin:modules').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)); }
function builderNavigationRow(rows) { return rowFromComponents(new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary), findComponent(rows, 'embed:helpers'), findComponent(rows, 'embed:reset')); }

if (!panel.__embedNavigationPatched) {
  const originalEditor = panel.buildEditorPanel.bind(panel);
  panel.buildEditorPanel = (interaction, ...args) => {
    const payload = compactPreviewPayload(originalEditor(interaction, ...args), interaction);
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
    const payload = compactPreviewPayload(originalBuilder(interaction, ...args), interaction);
    const state = panel.getSession(interaction);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    const appearance = findComponent(rows, 'embed:edit-media');
    if (appearance?.setLabel) appearance.setLabel('🎨 Appearance');
    const media = findComponent(rows, 'embed:edit-images') || new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🖼️ Media').setStyle(ButtonStyle.Primary);
    const contextRow = panelSelector(state);
    const buildRow = rowFromComponents(findComponent(rows, 'embed:edit-content'), findComponent(rows, 'embed:panels') || new ButtonBuilder().setCustomId('embed:panels').setLabel(`🧩 Panels (${state.panels?.length || 1})`).setStyle(ButtonStyle.Primary), appearance, media);
    const detailRow = rowFromComponents(findComponent(rows, 'embed:fields'), findComponent(rows, 'embed:buttons'), findComponent(rows, 'embed:update-existing'));
    const finishRow = rowFromComponents(findComponent(rows, 'embed:readiness'), findComponent(rows, 'embed:test-send'), findComponent(rows, 'embed:toggle-timestamp'));
    payload.components = [contextRow, buildRow, detailRow, finishRow, builderNavigationRow(rows)].filter(Boolean).slice(0, 5);
    return normalizeNavigationLabels(payload);
  };

  const originalPanels = panel.buildPanelsPanel.bind(panel);
  panel.buildPanelsPanel = (interaction, ...args) => {
    const payload = compactPreviewPayload(originalPanels(interaction, ...args), interaction);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    payload.components = [findRow(rows, 'embed:panel-select'), rowFromComponents(findComponent(rows, 'embed:panel-add'), findComponent(rows, 'embed:panel-duplicate'), findComponent(rows, 'embed:panel-remove')), rowFromComponents(findComponent(rows, 'embed:panel-up'), findComponent(rows, 'embed:panel-down')), rowFromComponents(findComponent(rows, 'embed:builder'))].filter(Boolean);
    return normalizeNavigationLabels(payload);
  };

  if (typeof panel.buildButtonsManagerPanel === 'function') {
    const originalButtonsManager = panel.buildButtonsManagerPanel.bind(panel);
    panel.buildButtonsManagerPanel = (interaction, ...args) => {
      const payload = originalButtonsManager(interaction, ...args);
      const rows = Array.isArray(payload?.components) ? payload.components : [];
      const selector = findRow(rows, 'embed:button-manager-select');
      const controls = findRow(rows, 'embed:button-manager-add');
      const reorder = rowFromComponents(findComponent(rows, 'embed:button-manager-up'), findComponent(rows, 'embed:button-manager-down'));
      const back = rowFromComponents(findComponent(rows, 'embed:builder'));
      payload.components = [selector, controls, reorder, back].filter(Boolean).slice(0, 5);
      return normalizeNavigationLabels(payload);
    };
  }

  ['buildAppearancePanel', 'buildAppearanceIconPanel', 'buildThumbnailOptionsPanel', 'buildMediaManagerPanel', 'buildMediaManager', 'buildMediaOptionsPanel', 'buildFileOptionsPanel', 'buildFieldsManagerPanel', 'buildButtonOptionsPanel', 'buildReadinessPanel'].forEach(wrapNavigationLabels);
  panel.__embedNavigationPatched = true;
}

module.exports = panel;
