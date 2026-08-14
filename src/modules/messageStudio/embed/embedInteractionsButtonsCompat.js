'use strict';

const original = require('./embedInteractionsFieldsCompat');
const panel = require('./embedButtonsCompat');

function selectedIndex(state) { const buttons = Array.isArray(state.buttons) ? state.buttons : []; return Number.isInteger(state.selectedButtonIndex) && buttons[state.selectedButtonIndex] ? state.selectedButtonIndex : null; }
function saveButtons(i, state, buttons, selectedButtonIndex = state.selectedButtonIndex) {
  let next = panel.saveSelected(state, { buttons });
  next = { ...next, selectedButtonIndex, hasUnsavedChanges: true };
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
    if (customId === 'embed:button-reply-edit') {
      if (index == null || String(buttons[index]?.action || '').toLowerCase() !== 'reply') return updateButtonOptions(i);
      await i.showModal(panel.buttonReplyModal(state));
      return true;
    }
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

  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:button-manager-select') {
      panel.saveSession(i, { ...state, selectedButtonIndex: Math.max(0, Number(i.values?.[0]) || 0) });
      return updateButtons(i);
    }
    if (customId === 'embed:button-action-select') {
      if (index == null) return updateButtons(i);
      const action = String(i.values?.[0] || 'none').toLowerCase();
      if (action !== 'none' && !panel.EMBED_BUTTON_ACTIONS.includes(action)) return true;
      const existing = buttons[index] || {};
      buttons[index] = action === 'none'
        ? { ...existing, action: '', actionValue: '' }
        : { ...existing, url: '', action, actionValue: '' };
      saveButtons(i, state, buttons, index);
      return updateButtonOptions(i);
    }
    if (customId === 'embed:button-row-select') {
      if (index == null) return updateButtons(i);
      const raw = String(i.values?.[0] || 'auto');
      const row = manualRow(raw);
      if (raw !== 'auto' && row == null) return true;
      if (row != null) {
        const manuallyAssigned = buttons.filter((button, buttonIndex) => buttonIndex !== index && manualRow(button?.row) === row).length;
        if (manuallyAssigned >= panel.MAX_BUTTONS_PER_ROW) {
          await i.reply({ content: `⚠️ Row ${row + 1} already has ${panel.MAX_BUTTONS_PER_ROW} explicitly placed buttons. Choose another row or Auto placement.`, flags: 64 });
          return true;
        }
      }
      buttons[index] = { ...buttons[index], row: row == null ? null : row };
      saveButtons(i, state, buttons, index);
      return updateButtonOptions(i);
    }
  }

  if (i.isRoleSelectMenu?.() && customId === 'embed:button-action-role') {
    if (index == null || !roleAction(buttons[index]?.action)) return updateButtonOptions(i);
    const roleId = String(i.values?.[0] || '');
    const role = i.guild?.roles?.cache?.get?.(roleId) || (await i.guild?.roles?.fetch?.(roleId).catch(() => null));
    if (!role || role.id === i.guildId || role.managed) {
      await i.reply({ content: '⚠️ Select a normal server role. Managed/integration roles and @everyone cannot be used.', flags: 64 });
      return true;
    }
    buttons[index] = { ...buttons[index], actionValue: role.id };
    saveButtons(i, state, buttons, index);
    return updateButtonOptions(i);
  }

  if (i.isModalSubmit?.() && (customId === 'embed:button-manager-save-new' || customId.startsWith('embed:button-manager-save:'))) {
    const label = String(i.fields.getTextInputValue('label') || '').trim().slice(0, 80);
    const emoji = String(i.fields.getTextInputValue('emoji') || '').trim().slice(0, 100);
    const url = String(i.fields.getTextInputValue('url') || '').trim();
    if (!label) { await i.reply({ content: 'A button label is required.', flags: 64 }); return true; }
    if (!validUrlOrVariable(url)) { await i.reply({ content: 'Button links must be HTTP/HTTPS URLs or a URL-producing Embed Studio variable.', flags: 64 }); return true; }
    const editingIndex = customId === 'embed:button-manager-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (buttons[editingIndex] || {}) : {};
    const entry = {
      ...existing,
      label,
      emoji,
      url,
      ...(url ? { action: '', actionValue: '' } : {}),
      style: ['primary', 'secondary', 'success', 'danger'].includes(String(existing.style || '').toLowerCase()) ? String(existing.style).toLowerCase() : 'primary',
    };
    let selectedButtonIndex;
    if (editingIndex == null) {
      if (buttons.length >= panel.MAX_EMBED_BUTTONS) { await i.reply({ content: `Maximum of ${panel.MAX_EMBED_BUTTONS} buttons reached.`, flags: 64 }); return true; }
      buttons.push({ ...entry, action: '', actionValue: '', row: null }); selectedButtonIndex = buttons.length - 1;
    } else { buttons[editingIndex] = entry; selectedButtonIndex = editingIndex; }
    saveButtons(i, state, buttons, selectedButtonIndex);
    return replyButtons(i);
  }

  if (i.isModalSubmit?.() && customId === 'embed:button-reply-save') {
    if (index == null || String(buttons[index]?.action || '').toLowerCase() !== 'reply') {
      await i.reply({ content: 'Select a Reply action button first.', flags: 64 });
      return true;
    }
    const replyText = String(i.fields.getTextInputValue('replyText') || '').trim().slice(0, 1000);
    if (!replyText) { await i.reply({ content: 'Reply text is required.', flags: 64 }); return true; }
    buttons[index] = { ...buttons[index], actionValue: replyText };
    saveButtons(i, state, buttons, index);
    return replyButtonOptions(i);
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
