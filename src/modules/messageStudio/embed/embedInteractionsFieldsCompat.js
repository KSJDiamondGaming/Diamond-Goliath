'use strict';

const original = require('./embedInteractionsAppearanceCompat');
const panel = require('./embedFieldsCompat');

function selectedIndex(state) {
  const fields = Array.isArray(state.fields) ? state.fields : [];
  return Number.isInteger(state.selectedFieldIndex) && fields[state.selectedFieldIndex] ? state.selectedFieldIndex : null;
}
function saveFields(i, state, fields, selectedFieldIndex = state.selectedFieldIndex, extra = {}) {
  let next = panel.saveSelected(state, { fields });
  next = { ...next, selectedFieldIndex, fieldLayout: extra.fieldLayout || next.fieldLayout || 'auto', hasUnsavedChanges: true };
  return panel.saveSession(i, next);
}
async function updateFields(i) {
  await i.update(panel.buildFieldsManagerPanel(i));
  return true;
}
async function replyFields(i) {
  await i.reply({ ...panel.buildFieldsManagerPanel(i), flags: 64 });
  return true;
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);
  const fields = Array.isArray(state.fields) ? [...state.fields] : [];
  const index = selectedIndex(state);

  if (i.isButton?.()) {
    if (customId === 'embed:fields') return updateFields(i);
    if (customId === 'embed:field-manager-add') {
      if (fields.length >= panel.MAX_EMBED_FIELDS) {
        await i.reply({ content: `Maximum of ${panel.MAX_EMBED_FIELDS} fields reached.`, flags: 64 });
        return true;
      }
      await i.showModal(panel.fieldEditorModal(state));
      return true;
    }
    if (customId === 'embed:field-manager-edit') {
      if (index == null) { await i.reply({ content: 'Select a field first.', flags: 64 }); return true; }
      await i.showModal(panel.fieldEditorModal(state, index));
      return true;
    }
    if (customId === 'embed:field-manager-inline') {
      if (index == null) return updateFields(i);
      fields[index] = { ...fields[index], inline: !Boolean(fields[index].inline) };
      saveFields(i, state, fields, index);
      return updateFields(i);
    }
    if (customId === 'embed:field-manager-remove') {
      if (index == null) return updateFields(i);
      fields.splice(index, 1);
      const nextIndex = fields.length ? Math.min(index, fields.length - 1) : null;
      saveFields(i, state, fields, nextIndex);
      return updateFields(i);
    }
    if (customId === 'embed:field-manager-up' || customId === 'embed:field-manager-down') {
      if (index == null) return updateFields(i);
      const target = index + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= fields.length) return updateFields(i);
      [fields[index], fields[target]] = [fields[target], fields[index]];
      saveFields(i, state, fields, target);
      return updateFields(i);
    }
  }

  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:field-manager-select') {
      panel.saveSession(i, { ...state, selectedFieldIndex: Math.max(0, Number(i.values?.[0]) || 0) });
      return updateFields(i);
    }
    if (customId === 'embed:field-manager-layout') {
      const layout = String(i.values?.[0] || 'auto');
      if (!['auto', '1', '2', '3'].includes(layout)) return true;
      panel.saveSession(i, { ...state, fieldLayout: layout, hasUnsavedChanges: true });
      return updateFields(i);
    }
  }

  if (i.isModalSubmit?.() && (customId === 'embed:field-manager-save-new' || customId.startsWith('embed:field-manager-save:'))) {
    const name = String(i.fields.getTextInputValue('name') || '').trim();
    const value = String(i.fields.getTextInputValue('value') || '').trim();
    if (!name || !value) {
      await i.reply({ content: 'Field name and content are required.', flags: 64 });
      return true;
    }
    const editingIndex = customId === 'embed:field-manager-save-new' ? null : Number(customId.split(':').pop());
    let selectedFieldIndex;
    if (editingIndex == null) {
      if (fields.length >= panel.MAX_EMBED_FIELDS) {
        await i.reply({ content: `Maximum of ${panel.MAX_EMBED_FIELDS} fields reached.`, flags: 64 });
        return true;
      }
      fields.push({ name: name.slice(0, 256), value: value.slice(0, 1024), inline: false });
      selectedFieldIndex = fields.length - 1;
    } else {
      const existing = fields[editingIndex] || { inline: false };
      fields[editingIndex] = { ...existing, name: name.slice(0, 256), value: value.slice(0, 1024), inline: Boolean(existing.inline) };
      selectedFieldIndex = editingIndex;
    }
    saveFields(i, state, fields, selectedFieldIndex);
    return replyFields(i);
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
