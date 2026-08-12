'use strict';

const original = require('./embedInteractionsFieldsCompat');
const panel = require('./embedButtonsCompat');

function selectedIndex(state) { const buttons = Array.isArray(state.buttons) ? state.buttons : []; return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null; }
function saveButtons(i, state, buttons, selectedButtonIndex = state.selectedButtonIndex) { return panel.saveSession(i, { ...state, buttons, selectedButtonIndex, hasUnsavedChanges: true }); }
async function updateButtons(i) { await i.update(panel.buildButtonsManagerPanel(i)); return true; }
async function updateButtonOptions(i) { await i.update(panel.buildButtonOptionsPanel(i)); return true; }
async function replyButtons(i) { await i.reply({ ...panel.buildButtonsManagerPanel(i), flags: 64 }); return true; }
function normalizeAction(value) { return String(value || '').trim().replace(/[^a-zA-Z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }
function validUrlOrVariable(value) { const raw = String(value || '').trim(); if (!raw) return true; if (/\{[a-zA-Z0-9_]+\}/.test(raw)) return true; try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);
  const buttons = Array.isArray(state.buttons) ? [...state.buttons] : [];
  const index = selectedIndex(state);

  if (i.isButton?.()) {
    if (customId === 'embed:buttons') return updateButtons(i);
    if (customId === 'embed:button-manager-add') {
      if (buttons.length >= panel.MAX_EMBED_BUTTONS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_BUTTONS} buttons reached.`, flags: 64 }); return true; }
      await i.showModal(panel.buttonEditorModal(state)); return true;
    }
    if (customId === 'embed:button-manager-edit') {
      if (index == null) { await i.reply({ content: 'Select a button first.', flags: 64 }); return true; }
      await i.showModal(panel.buttonEditorModal(state, index)); return true;
    }
    if (customId === 'embed:button-manager-options') {
      if (index == null) { await i.reply({ content: 'Select a button first.', flags: 64 }); return true; }
      return updateButtonOptions(i);
    }
    if (customId === 'embed:button-options-back') return updateButtons(i);
    if (customId.startsWith('embed:button-style:')) {
      if (index == null) return updateButtons(i);
      const style = customId.split(':').pop();
      if (!['primary', 'secondary', 'success', 'danger'].includes(style)) return true;
      buttons[index] = { ...buttons[index], style };
      saveButtons(i, state, buttons, index);
      return updateButtonOptions(i);
    }
    if (customId === 'embed:button-manager-remove') {
      if (index == null) return updateButtons(i);
      buttons.splice(index, 1);
      saveButtons(i, state, buttons, buttons.length ? Math.min(index, buttons.length - 1) : null);
      return updateButtons(i);
    }
    if (customId === 'embed:button-manager-up' || customId === 'embed:button-manager-down') {
      if (index == null) return updateButtons(i);
      const target = index + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= buttons.length) return updateButtons(i);
      [buttons[index], buttons[target]] = [buttons[target], buttons[index]];
      saveButtons(i, state, buttons, target);
      return updateButtons(i);
    }
  }

  if (i.isStringSelectMenu?.() && customId === 'embed:button-manager-select') {
    panel.saveSession(i, { ...state, selectedButtonIndex: Math.max(0, Number(i.values?.[0]) || 0) });
    return updateButtons(i);
  }

  if (i.isModalSubmit?.() && (customId === 'embed:button-manager-save-new' || customId.startsWith('embed:button-manager-save:'))) {
    const label = String(i.fields.getTextInputValue('label') || '').trim().slice(0, 80);
    const emoji = String(i.fields.getTextInputValue('emoji') || '').trim().slice(0, 100);
    const url = String(i.fields.getTextInputValue('url') || '').trim();
    const action = normalizeAction(i.fields.getTextInputValue('action'));
    if (!label) { await i.reply({ content: 'A button label is required.', flags: 64 }); return true; }
    if (!validUrlOrVariable(url)) { await i.reply({ content: 'Button links must be HTTP/HTTPS URLs or a URL-producing Embed Studio variable.', flags: 64 }); return true; }
    if (url && action) { await i.reply({ content: 'Choose either a link URL or a custom action, not both.', flags: 64 }); return true; }
    const editingIndex = customId === 'embed:button-manager-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (buttons[editingIndex] || {}) : {};
    const entry = { ...existing, label, emoji, url, action, style: ['primary', 'secondary', 'success', 'danger'].includes(String(existing.style || '').toLowerCase()) ? String(existing.style).toLowerCase() : 'primary' };
    let selectedButtonIndex;
    if (editingIndex == null) {
      if (buttons.length >= panel.MAX_EMBED_BUTTONS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_BUTTONS} buttons reached.`, flags: 64 }); return true; }
      buttons.push(entry); selectedButtonIndex = buttons.length - 1;
    } else { buttons[editingIndex] = entry; selectedButtonIndex = editingIndex; }
    saveButtons(i, state, buttons, selectedButtonIndex);
    return replyButtons(i);
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
