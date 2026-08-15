'use strict';

const original = require('./embedInteractionsCore');
const panel = require('./embedPanel');
const media = require('./embedMedia');
const { ensureAssetCached } = require('./embedAssetStore');

media.installThumbnailUi(panel);
panel.getPanelMedia = media.getPanelMedia;
panel.setPanelMedia = media.setPanelMedia;
panel.mediaModel = media.mediaModel;

function who(i) { return panel.memberName(i); }

function saveThumbnailState(i, state, thumbnail) {
  const index = state.selectedPanelIndex || 0;
  let next = panel.setPanelMedia(state, index, {
    ...panel.getPanelMedia(state, index),
    thumbnail: panel.mediaModel.normalizeThumbnail(thumbnail),
  });
  const current = panel.getPanelMedia(next, index);
  next = panel.saveSelected(next, { thumbnail: current.thumbnail?.source || '' });
  next = { ...next, hasUnsavedChanges: true };
  return panel.saveSession(i, next);
}

async function updateThumbnailPanel(i) {
  await i.update(panel.buildThumbnailOptionsPanel(i));
  return true;
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);

  if (i.isButton?.()) {
    if (customId === 'embed:media-thumbnail') return updateThumbnailPanel(i);
    if (customId === 'embed:thumbnail-back') {
      await i.update(panel.buildMediaManagerPanel(i, who(i)));
      return true;
    }
    if (customId === 'embed:thumbnail-edit') {
      await i.showModal(panel.thumbnailModal(state));
      return true;
    }
    if (customId === 'embed:thumbnail-upload') {
      await i.showModal(panel.thumbnailUploadModal());
      return true;
    }
    if (customId === 'embed:thumbnail-clear') {
      saveThumbnailState(i, state, { source: '', alt: '' });
      return updateThumbnailPanel(i);
    }
  }

  if (i.isModalSubmit?.() && customId === 'embed:thumbnail-upload-save') {
    const uploaded = i.fields.getUploadedFiles('thumbnail_file', true);
    const attachment = [...(uploaded?.values?.() || [])][0];
    if (!attachment) {
      await i.reply({ content: 'No thumbnail was uploaded.', flags: 64 });
      return true;
    }
    const contentType = String(attachment.contentType || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      await i.reply({ content: '⚠️ Thumbnails must be image files.', flags: 64 });
      return true;
    }
    try {
      await ensureAssetCached('global', attachment.url);
    } catch (error) {
      console.warn('[Embed Media] thumbnail persistence failed:', attachment?.name || attachment?.url, error?.message || error);
    }
    saveThumbnailState(i, state, {
      source: attachment.url,
      alt: attachment.description || attachment.name || '',
    });
    await i.reply({ content: '✅ Thumbnail uploaded.', ...panel.buildThumbnailOptionsPanel(i), flags: 64 });
    return true;
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
