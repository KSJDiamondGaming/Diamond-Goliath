'use strict';

const interactionCore = require('./embedInteractionsCore');
const { handleButtonAction } = require('./embedButtonsCompat');
const panel = require('./embedNavigationCompat');
const media = require('./embedMedia');
const { ensureAssetCached } = require('./embedAssetStore');

media.installThumbnailUi(panel);
panel.getPanelMedia = media.getPanelMedia;
panel.setPanelMedia = media.setPanelMedia;
panel.mediaModel = media.mediaModel;

const DELIVERY_ACTIONS = new Set(['embed:test-send', 'embed:use', 'embed:update-existing']);

function who(i) { return panel.memberName(i); }
function saveAppearance(i, state, patch) {
  const next = panel.saveSelected(state, patch);
  return panel.saveSession(i, { ...next, hasUnsavedChanges: true });
}
function saveThumbnailState(i, state, thumbnail) {
  const panelIndex = state.selectedPanelIndex || 0;
  let next = panel.setPanelMedia(state, panelIndex, {
    ...panel.getPanelMedia(state, panelIndex),
    thumbnail: panel.mediaModel.normalizeThumbnail(thumbnail),
  });
  const current = panel.getPanelMedia(next, panelIndex);
  next = panel.saveSelected(next, { thumbnail: current.thumbnail?.source || '' });
  return panel.saveSession(i, { ...next, hasUnsavedChanges: true });
}
async function updateAppearance(i) { await i.update(panel.buildAppearancePanel(i)); return true; }
async function updateIcon(i, kind) { await i.update(panel.buildAppearanceIconPanel(i, kind)); return true; }
async function updateThumbnailPanel(i) { await i.update(panel.buildThumbnailOptionsPanel(i)); return true; }
function validKind(kind) { return kind === 'author' || kind === 'footer'; }
function iconField(kind) { return kind === 'author' ? 'authorIcon' : 'footerIcon'; }

function selectedFieldIndex(state) {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  return Number.isInteger(state.selectedFieldIndex) && fields[state.selectedFieldIndex] ? state.selectedFieldIndex : null;
}
function saveFields(i, state, fields, selectedIndex = state.selectedFieldIndex, extra = {}) {
  let next = panel.saveSelected(state, { fields });
  next = { ...next, selectedFieldIndex: selectedIndex, fieldLayout: extra.fieldLayout || next.fieldLayout || 'auto', hasUnsavedChanges: true };
  return panel.saveSession(i, next);
}
async function updateFields(i) { await i.update(panel.buildFieldsManagerPanel(i)); return true; }
async function replyFields(i) { await i.reply({ ...panel.buildFieldsManagerPanel(i), flags: 64 }); return true; }

function selectedButtonIndex(state) {
  const buttons = Array.isArray(state.buttons) ? state.buttons : [];
  return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null;
}
function saveButtons(i, state, buttons, selectedIndex = state.selectedButtonIndex) {
  let next = panel.saveSelected(state, { buttons });
  next = { ...next, selectedButtonIndex: selectedIndex, hasUnsavedChanges: true };
  return panel.saveSession(i, next);
}
async function updateButtons(i) { await i.update(panel.buildButtonsManagerPanel(i)); return true; }
async function updateButtonOptions(i) { await i.update(panel.buildButtonOptionsPanel(i)); return true; }
async function replyButtons(i) { await i.reply({ ...panel.buildButtonsManagerPanel(i), flags: 64 }); return true; }
async function replyButtonOptions(i) { await i.reply({ ...panel.buildButtonOptionsPanel(i), flags: 64 }); return true; }
function validUrlOrVariable(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (/\{[a-zA-Z0-9_]+\}/.test(raw)) return true;
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol); } catch { return false; }
}
function roleAction(action) { return ['toggle-role', 'add-role', 'remove-role'].includes(String(action || '').toLowerCase()); }
function manualRow(value) {
  if (value === 'auto' || value == null || value === '') return null;
  const row = Number(value);
  return Number.isInteger(row) && row >= 0 && row < panel.MAX_DEPLOYED_BUTTON_ROWS ? row : null;
}

async function handleBuilderInteractions(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);
  const fields = Array.isArray(state.fields) ? [...state.fields] : [];
  const fieldIndex = selectedFieldIndex(state);
  const buttons = Array.isArray(state.buttons) ? [...state.buttons] : [];
  const buttonIndex = selectedButtonIndex(state);

  if (i.isButton?.()) {
    if (customId === 'embed:edit-media') return updateAppearance(i);
    if (customId === 'embed:appearance-back') return updateAppearance(i);
    if (customId === 'embed:appearance-details') { await i.showModal(panel.appearanceDetailsModal(state)); return true; }
    if (customId === 'embed:appearance-author-icon') return updateIcon(i, 'author');
    if (customId === 'embed:appearance-footer-icon') return updateIcon(i, 'footer');
    if (customId.startsWith('embed:appearance-icon-url:')) {
      const kind = customId.split(':').pop(); if (!validKind(kind)) return true;
      await i.showModal(panel.appearanceIconUrlModal(kind, state)); return true;
    }
    if (customId.startsWith('embed:appearance-icon-upload:')) {
      const kind = customId.split(':').pop(); if (!validKind(kind)) return true;
      await i.showModal(panel.appearanceIconUploadModal(kind)); return true;
    }
    if (customId.startsWith('embed:appearance-icon-clear:')) {
      const kind = customId.split(':').pop(); if (!validKind(kind)) return true;
      saveAppearance(i, state, { [iconField(kind)]: '' }); return updateIcon(i, kind);
    }
    if (customId === 'embed:media-thumbnail') return updateThumbnailPanel(i);
    if (customId === 'embed:thumbnail-back') { await i.update(panel.buildMediaManagerPanel(i, who(i))); return true; }
    if (customId === 'embed:thumbnail-edit') { await i.showModal(panel.thumbnailModal(state)); return true; }
    if (customId === 'embed:thumbnail-upload') { await i.showModal(panel.thumbnailUploadModal()); return true; }
    if (customId === 'embed:thumbnail-clear') { saveThumbnailState(i, state, { source: '', alt: '' }); return updateThumbnailPanel(i); }

    if (customId === 'embed:fields') return updateFields(i);
    if (customId === 'embed:field-manager-add') {
      if (fields.length >= panel.MAX_EMBED_FIELDS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_FIELDS} fields reached.`, flags: 64 }); return true; }
      await i.showModal(panel.fieldEditorModal(state)); return true;
    }
    if (customId === 'embed:field-manager-edit') {
      if (fieldIndex == null) { await i.reply({ content: 'Select a field first.', flags: 64 }); return true; }
      await i.showModal(panel.fieldEditorModal(state, fieldIndex)); return true;
    }
    if (customId === 'embed:field-manager-inline') {
      if (fieldIndex == null) return updateFields(i);
      fields[fieldIndex] = { ...fields[fieldIndex], inline: !Boolean(fields[fieldIndex].inline) };
      saveFields(i, state, fields, fieldIndex); return updateFields(i);
    }
    if (customId === 'embed:field-manager-remove') {
      if (fieldIndex == null) return updateFields(i);
      fields.splice(fieldIndex, 1);
      saveFields(i, state, fields, fields.length ? Math.min(fieldIndex, fields.length - 1) : null); return updateFields(i);
    }
    if (customId === 'embed:field-manager-up' || customId === 'embed:field-manager-down') {
      if (fieldIndex == null) return updateFields(i);
      const target = fieldIndex + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= fields.length) return updateFields(i);
      [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
      saveFields(i, state, fields, target); return updateFields(i);
    }

    if (customId === 'embed:buttons') return updateButtons(i);
    if (customId === 'embed:button-manager-add') {
      if (buttons.length >= panel.MAX_EMBED_BUTTONS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_BUTTONS} buttons reached.`, flags: 64 }); return true; }
      await i.showModal(panel.buttonEditorModal(state)); return true;
    }
    if (customId === 'embed:button-manager-edit') {
      if (buttonIndex == null) { await i.reply({ content: 'Select a button first.', flags: 64 }); return true; }
      await i.showModal(panel.buttonEditorModal(state, buttonIndex)); return true;
    }
    if (customId === 'embed:button-manager-options') {
      if (buttonIndex == null) { await i.reply({ content: 'Select a button first.', flags: 64 }); return true; }
      return updateButtonOptions(i);
    }
    if (customId === 'embed:button-options-back') return updateButtons(i);
    if (customId === 'embed:button-reply-edit') {
      if (buttonIndex == null || String(buttons[buttonIndex]?.action || '').toLowerCase() !== 'reply') return updateButtonOptions(i);
      await i.showModal(panel.buttonReplyModal(state)); return true;
    }
    if (customId.startsWith('embed:button-style:')) {
      if (buttonIndex == null) return updateButtons(i);
      const style = customId.split(':').pop(); if (!['primary', 'secondary', 'success', 'danger'].includes(style)) return true;
      buttons[buttonIndex] = { ...buttons[buttonIndex], style }; saveButtons(i, state, buttons, buttonIndex); return updateButtonOptions(i);
    }
    if (customId === 'embed:button-manager-remove') {
      if (buttonIndex == null) return updateButtons(i);
      buttons.splice(buttonIndex, 1); saveButtons(i, state, buttons, buttons.length ? Math.min(buttonIndex, buttons.length - 1) : null); return updateButtons(i);
    }
    if (customId === 'embed:button-manager-up' || customId === 'embed:button-manager-down') {
      if (buttonIndex == null) return updateButtons(i);
      const target = buttonIndex + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= buttons.length) return updateButtons(i);
      [buttons[buttonIndex], buttons[target]] = [buttons[target], buttons[buttonIndex]];
      saveButtons(i, state, buttons, target); return updateButtons(i);
    }
  }

  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:field-manager-select') { panel.saveSession(i, { ...state, selectedFieldIndex: Math.max(0, Number(i.values?.[0]) || 0) }); return updateFields(i); }
    if (customId === 'embed:field-manager-layout') {
      const layout = String(i.values?.[0] || 'auto'); if (!['auto', '1', '2', '3'].includes(layout)) return true;
      panel.saveSession(i, { ...state, fieldLayout: layout, hasUnsavedChanges: true }); return updateFields(i);
    }
    if (customId === 'embed:button-manager-select') { panel.saveSession(i, { ...state, selectedButtonIndex: Math.max(0, Number(i.values?.[0]) || 0) }); return updateButtons(i); }
    if (customId === 'embed:button-action-select') {
      if (buttonIndex == null) return updateButtons(i);
      const action = String(i.values?.[0] || 'none').toLowerCase(); if (action !== 'none' && !panel.EMBED_BUTTON_ACTIONS.includes(action)) return true;
      const existing = buttons[buttonIndex] || {};
      buttons[buttonIndex] = action === 'none' ? { ...existing, action: '', actionValue: '' } : { ...existing, url: '', action, actionValue: '' };
      saveButtons(i, state, buttons, buttonIndex); return updateButtonOptions(i);
    }
    if (customId === 'embed:button-row-select') {
      if (buttonIndex == null) return updateButtons(i);
      const raw = String(i.values?.[0] || 'auto'); const row = manualRow(raw); if (raw !== 'auto' && row == null) return true;
      if (row != null) {
        const assigned = buttons.filter((button, idx) => idx !== buttonIndex && manualRow(button?.row) === row).length;
        if (assigned >= panel.MAX_BUTTONS_PER_ROW) { await i.reply({ content: `⚠️ Row ${row + 1} already has ${panel.MAX_BUTTONS_PER_ROW} explicitly placed buttons. Choose another row or Auto placement.`, flags: 64 }); return true; }
      }
      buttons[buttonIndex] = { ...buttons[buttonIndex], row: row == null ? null : row }; saveButtons(i, state, buttons, buttonIndex); return updateButtonOptions(i);
    }
  }

  if (i.isRoleSelectMenu?.() && customId === 'embed:button-action-role') {
    if (buttonIndex == null || !roleAction(buttons[buttonIndex]?.action)) return updateButtonOptions(i);
    const roleId = String(i.values?.[0] || '');
    const role = i.guild?.roles?.cache?.get?.(roleId) || (await i.guild?.roles?.fetch?.(roleId).catch(() => null));
    if (!role || role.id === i.guildId || role.managed) { await i.reply({ content: '⚠️ Select a normal server role. Managed/integration roles and @everyone cannot be used.', flags: 64 }); return true; }
    buttons[buttonIndex] = { ...buttons[buttonIndex], actionValue: role.id }; saveButtons(i, state, buttons, buttonIndex); return updateButtonOptions(i);
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-details-save:')) {
    saveAppearance(i, state, { authorName: i.fields.getTextInputValue('authorName'), authorUrl: i.fields.getTextInputValue('authorUrl'), footer: i.fields.getTextInputValue('footer') });
    await i.reply({ ...panel.buildAppearancePanel(i), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-icon-url-save:')) {
    const kind = customId.split(':')[3]; if (!validKind(kind)) return true;
    saveAppearance(i, state, { [iconField(kind)]: i.fields.getTextInputValue('source') }); await i.reply({ ...panel.buildAppearanceIconPanel(i, kind), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-icon-upload-save:')) {
    const kind = customId.split(':').pop(); if (!validKind(kind)) return true;
    const uploaded = i.fields.getUploadedFiles('icon_file', true); const attachment = [...(uploaded?.values?.() || [])][0];
    if (!attachment) { await i.reply({ content: 'No icon was uploaded.', flags: 64 }); return true; }
    const contentType = String(attachment.contentType || '').toLowerCase(); if (contentType && !contentType.startsWith('image/')) { await i.reply({ content: '⚠️ Author and footer icons must be image files.', flags: 64 }); return true; }
    try { await ensureAssetCached('global', attachment.url); } catch (error) { console.warn('[Embed Media] appearance icon persistence failed:', attachment?.name || attachment?.url, error?.message || error); }
    saveAppearance(i, state, { [iconField(kind)]: attachment.url }); await i.reply({ content: `✅ ${kind === 'author' ? 'Author' : 'Footer'} icon uploaded.`, ...panel.buildAppearanceIconPanel(i, kind), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId === 'embed:thumbnail-upload-save') {
    const uploaded = i.fields.getUploadedFiles('thumbnail_file', true); const attachment = [...(uploaded?.values?.() || [])][0];
    if (!attachment) { await i.reply({ content: 'No thumbnail was uploaded.', flags: 64 }); return true; }
    const contentType = String(attachment.contentType || '').toLowerCase(); if (contentType && !contentType.startsWith('image/')) { await i.reply({ content: '⚠️ Thumbnails must be image files.', flags: 64 }); return true; }
    try { await ensureAssetCached('global', attachment.url); } catch (error) { console.warn('[Embed Media] thumbnail persistence failed:', attachment?.name || attachment?.url, error?.message || error); }
    saveThumbnailState(i, state, { source: attachment.url, alt: attachment.description || attachment.name || '' }); await i.reply({ content: '✅ Thumbnail uploaded.', ...panel.buildThumbnailOptionsPanel(i), flags: 64 }); return true;
  }

  if (i.isModalSubmit?.() && (customId === 'embed:field-manager-save-new' || customId.startsWith('embed:field-manager-save:'))) {
    const name = String(i.fields.getTextInputValue('name') || '').trim(); const value = String(i.fields.getTextInputValue('value') || '').trim();
    if (!name || !value) { await i.reply({ content: 'Field name and content are required.', flags: 64 }); return true; }
    const editingIndex = customId === 'embed:field-manager-save-new' ? null : Number(customId.split(':').pop()); let nextFieldIndex;
    if (editingIndex == null) {
      if (fields.length >= panel.MAX_EMBED_FIELDS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_FIELDS} fields reached.`, flags: 64 }); return true; }
      fields.push({ name: name.slice(0, 256), value: value.slice(0, 1024), inline: false }); nextFieldIndex = fields.length - 1;
    } else {
      const existing = fields[editingIndex] || { inline: false }; fields[editingIndex] = { ...existing, name: name.slice(0, 256), value: value.slice(0, 1024), inline: Boolean(existing.inline) }; nextFieldIndex = editingIndex;
    }
    saveFields(i, state, fields, nextFieldIndex); return replyFields(i);
  }

  if (i.isModalSubmit?.() && (customId === 'embed:button-manager-save-new' || customId.startsWith('embed:button-manager-save:'))) {
    const label = String(i.fields.getTextInputValue('label') || '').trim().slice(0, 80); const emoji = String(i.fields.getTextInputValue('emoji') || '').trim().slice(0, 100); const url = String(i.fields.getTextInputValue('url') || '').trim();
    if (!label) { await i.reply({ content: 'A button label is required.', flags: 64 }); return true; }
    if (!validUrlOrVariable(url)) { await i.reply({ content: 'Button links must be HTTP/HTTPS URLs or a URL-producing Embed Studio variable.', flags: 64 }); return true; }
    const editingIndex = customId === 'embed:button-manager-save-new' ? null : Number(customId.split(':').pop()); const existing = Number.isInteger(editingIndex) ? (buttons[editingIndex] || {}) : {};
    const entry = { ...existing, label, emoji, url, ...(url ? { action: '', actionValue: '' } : {}), style: ['primary', 'secondary', 'success', 'danger'].includes(String(existing.style || '').toLowerCase()) ? String(existing.style).toLowerCase() : 'primary' };
    let nextButtonIndex;
    if (editingIndex == null) { if (buttons.length >= panel.MAX_EMBED_BUTTONS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_BUTTONS} buttons reached.`, flags: 64 }); return true; } buttons.push({ ...entry, action: '', actionValue: '', row: null }); nextButtonIndex = buttons.length - 1; }
    else { buttons[editingIndex] = entry; nextButtonIndex = editingIndex; }
    saveButtons(i, state, buttons, nextButtonIndex); return replyButtons(i);
  }
  if (i.isModalSubmit?.() && customId === 'embed:button-reply-save') {
    if (buttonIndex == null || String(buttons[buttonIndex]?.action || '').toLowerCase() !== 'reply') { await i.reply({ content: 'Select a Reply action button first.', flags: 64 }); return true; }
    const replyText = String(i.fields.getTextInputValue('replyText') || '').trim().slice(0, 1000); if (!replyText) { await i.reply({ content: 'Reply text is required.', flags: 64 }); return true; }
    buttons[buttonIndex] = { ...buttons[buttonIndex], actionValue: replyText }; saveButtons(i, state, buttons, buttonIndex); return replyButtonOptions(i);
  }

  return interactionCore.handleInteraction(i);
}

async function showReadiness(interaction) {
  const payload = panel.buildReadinessPanel(interaction);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isRoleSelectMenu?.()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: 64 });
  return true;
}

async function updateWith(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

function selectState(interaction, patch = {}) {
  const state = panel.getSession(interaction);
  return panel.saveSession(interaction, { ...state, ...patch });
}

async function routeReadinessFix(interaction) {
  const report = panel.getReadinessReport(interaction);
  const target = panel.getReadinessFixTarget(report);
  const state = panel.getSession(interaction);

  if (target.type === 'channel') return updateWith(interaction, panel.buildEditorPanel(interaction, panel.memberName?.(interaction)));

  if (target.type === 'button') {
    const buttons = Array.isArray(state.buttons) ? state.buttons : [];
    const selectedButtonIndex = Number.isInteger(target.index) && buttons[target.index] ? target.index : (buttons.length ? 0 : null);
    selectState(interaction, { selectedButtonIndex });
    return updateWith(interaction, panel.buildButtonsManagerPanel(interaction));
  }

  if (target.type === 'field') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    const fields = Array.isArray(panels[panelIndex]?.fields) ? panels[panelIndex].fields : [];
    const selectedFieldIndex = Number.isInteger(target.fieldIndex) && fields[target.fieldIndex] ? target.fieldIndex : (fields.length ? 0 : null);
    selectState(interaction, { selectedPanelIndex: panelIndex, selectedFieldIndex });
    return updateWith(interaction, panel.buildFieldsManagerPanel(interaction));
  }

  if (target.type === 'media') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    selectState(interaction, { selectedPanelIndex: panelIndex });
    return updateWith(interaction, panel.buildMediaManagerPanel(interaction));
  }

  if (target.type === 'panel') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    selectState(interaction, { selectedPanelIndex: panelIndex });
    return updateWith(interaction, panel.buildBuilderPanel(interaction, panel.memberName?.(interaction)));
  }

  if (target.type === 'variables' && typeof panel.buildHelpersPanel === 'function') {
    return updateWith(interaction, panel.buildHelpersPanel(interaction, panel.memberName?.(interaction)));
  }

  return updateWith(interaction, panel.buildBuilderPanel(interaction, panel.memberName?.(interaction)));
}

async function handleInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (interaction.isStringSelectMenu?.() && customId === 'embed:builder-panel-select') {
    const state = panel.getSession(interaction);
    const index = Math.max(0, Math.min(Number(interaction.values?.[0]) || 0, Math.max(0, (state.panels?.length || 1) - 1)));
    panel.saveSession(interaction, { ...state, selectedPanelIndex: index, selectedFieldIndex: null });
    await interaction.update(panel.buildBuilderPanel(interaction, panel.memberName(interaction)));
    return true;
  }

  if (interaction.isButton?.() && customId === 'embed:actions') {
    await interaction.update(panel.buildActionsPanel(interaction));
    return true;
  }

  if ((customId === 'embed:readiness' || customId === 'embed:readiness-refresh') && interaction.isButton?.()) {
    return showReadiness(interaction);
  }
  if (customId === 'embed:readiness-fix' && interaction.isButton?.()) return routeReadinessFix(interaction);

  if (DELIVERY_ACTIONS.has(customId)) {
    const report = panel.getReadinessReport(interaction);
    if (!report.ready) {
      const payload = panel.buildReadinessPanel(interaction);
      const prefix = '❌ This embed is not ready to send. Fix the issues below first.';
      payload.embeds[0].setDescription(`${prefix}\n\n${payload.embeds[0].data.description || ''}`.slice(0, 4096));
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, flags: 64 });
      return true;
    }
  }

  if (await handleButtonAction(interaction)) return true;
  return handleBuilderInteractions(interaction);
}

module.exports = { handleInteraction };
