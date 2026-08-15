'use strict';

const original = require('./embedInteractionsThumbnailCompat');
const panel = require('./embedPanel');
const { ensureAssetCached } = require('./embedAssetStore');

function who(i) { return panel.memberName(i); }
function saveAppearance(i, state, patch) {
  const next = panel.saveSelected(state, patch);
  return panel.saveSession(i, { ...next, hasUnsavedChanges: true });
}
async function updateAppearance(i) {
  await i.update(panel.buildAppearancePanel(i));
  return true;
}
async function updateIcon(i, kind) {
  await i.update(panel.buildAppearanceIconPanel(i, kind));
  return true;
}
function validKind(kind) { return kind === 'author' || kind === 'footer'; }
function iconField(kind) { return kind === 'author' ? 'authorIcon' : 'footerIcon'; }

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);

  if (i.isButton?.()) {
    if (customId === 'embed:edit-media') return updateAppearance(i);
    if (customId === 'embed:appearance-back') return updateAppearance(i);
    if (customId === 'embed:appearance-details') {
      await i.showModal(panel.appearanceDetailsModal(state));
      return true;
    }
    if (customId === 'embed:appearance-author-icon') return updateIcon(i, 'author');
    if (customId === 'embed:appearance-footer-icon') return updateIcon(i, 'footer');

    if (customId.startsWith('embed:appearance-icon-url:')) {
      const kind = customId.split(':').pop();
      if (!validKind(kind)) return true;
      await i.showModal(panel.appearanceIconUrlModal(kind, state));
      return true;
    }
    if (customId.startsWith('embed:appearance-icon-upload:')) {
      const kind = customId.split(':').pop();
      if (!validKind(kind)) return true;
      await i.showModal(panel.appearanceIconUploadModal(kind));
      return true;
    }
    if (customId.startsWith('embed:appearance-icon-clear:')) {
      const kind = customId.split(':').pop();
      if (!validKind(kind)) return true;
      saveAppearance(i, state, { [iconField(kind)]: '' });
      return updateIcon(i, kind);
    }
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-details-save:')) {
    saveAppearance(i, state, {
      authorName: i.fields.getTextInputValue('authorName'),
      authorUrl: i.fields.getTextInputValue('authorUrl'),
      footer: i.fields.getTextInputValue('footer'),
    });
    await i.reply({ ...panel.buildAppearancePanel(i), flags: 64 });
    return true;
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-icon-url-save:')) {
    const parts = customId.split(':');
    const kind = parts[3];
    if (!validKind(kind)) return true;
    const source = i.fields.getTextInputValue('source');
    saveAppearance(i, state, { [iconField(kind)]: source });
    await i.reply({ ...panel.buildAppearanceIconPanel(i, kind), flags: 64 });
    return true;
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:appearance-icon-upload-save:')) {
    const kind = customId.split(':').pop();
    if (!validKind(kind)) return true;
    const uploaded = i.fields.getUploadedFiles('icon_file', true);
    const attachment = [...(uploaded?.values?.() || [])][0];
    if (!attachment) {
      await i.reply({ content: 'No icon was uploaded.', flags: 64 });
      return true;
    }
    const contentType = String(attachment.contentType || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      await i.reply({ content: '⚠️ Author and footer icons must be image files.', flags: 64 });
      return true;
    }
    try {
      await ensureAssetCached('global', attachment.url);
    } catch (error) {
      console.warn('[Embed Media] appearance icon persistence failed:', attachment?.name || attachment?.url, error?.message || error);
    }
    saveAppearance(i, state, { [iconField(kind)]: attachment.url });
    await i.reply({ content: `✅ ${kind === 'author' ? 'Author' : 'Footer'} icon uploaded.`, ...panel.buildAppearanceIconPanel(i, kind), flags: 64 });
    return true;
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
