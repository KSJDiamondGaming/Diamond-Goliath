'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const original = require('./embedInteractionsLegacy');
const panel = require('./embedMediaUploadCompat');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const { ensureAssetCached } = require('./embedAssetStore');
const { saveEmbedDeployment, getEmbedDeployment, getDeploymentKeyFromState } = require('./embedDeployments');
const { buildEmbedPayload } = require('./embedRenderer');

function who(i) { return panel.memberName(i); }
function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}
function saveMediaState(i, state, media, extra = {}) {
  const index = state.selectedPanelIndex || 0;
  let next = panel.setPanelMedia(state, index, media);
  const current = panel.getPanelMedia(next, index);
  next = panel.saveSelected(next, { image: current.gallery?.[0]?.source || '', thumbnail: current.thumbnail?.source || '' });
  return panel.saveSession(i, { ...next, ...extra, hasUnsavedChanges: true });
}
async function updateMediaPanel(i) { await i.update(panel.buildMediaManagerPanel(i, who(i))); return true; }
async function updateMediaOptions(i) { await i.update(panel.buildMediaOptionsPanel(i)); return true; }
async function updateFileOptions(i) { await i.update(panel.buildFileOptionsPanel(i)); return true; }
async function replyMediaPanel(i) { await i.reply({ ...panel.buildMediaManagerPanel(i, who(i)), flags: 64 }); return true; }
async function buildPayload(state, interaction, ephemeral = false) {
  return buildEmbedPayload({
    embeds: panel.buildPreviewEmbeds(state, interaction),
    actionRows: panel.buttonRows(state, interaction),
    allowUserPing: Boolean(state.allowUserPing),
    userId: interaction.user?.id || null,
    ephemeral,
    media: state.media || state.mediaV2,
    interaction,
  });
}
function uploadType(attachment) {
  const type = String(attachment?.contentType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return 'file';
}
async function cacheUploadedAttachment(attachment) {
  if (!attachment?.url) return;
  try { await ensureAssetCached('global', attachment.url); }
  catch (error) { console.warn('[Embed Media] upload persistence failed:', attachment?.name || attachment?.url, error?.message || error); }
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const state = panel.getSession(i);

  if (customId === 'embed:edit-images' && i.isButton?.()) return updateMediaPanel(i);

  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:media-gallery-select') {
      panel.saveSession(i, { ...state, selectedMediaIndex: Number(i.values[0]) });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-file-select') {
      panel.saveSession(i, { ...state, selectedFileIndex: Number(i.values[0]) });
      return updateMediaPanel(i);
    }
  }

  if (i.isButton?.()) {
    const media = panel.getPanelMedia(state);
    const galleryIndex = Number.isInteger(state.selectedMediaIndex) ? state.selectedMediaIndex : null;
    const fileIndex = Number.isInteger(state.selectedFileIndex) ? state.selectedFileIndex : null;

    if (customId === 'embed:media-upload') { await i.showModal(panel.mediaUploadModal()); return true; }
    if (customId === 'embed:media-thumbnail') { await i.showModal(panel.thumbnailModal(state)); return true; }
    if (customId === 'embed:media-options') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) { await i.reply({ content: 'Select a gallery item first.', flags: 64 }); return true; }
      return updateMediaOptions(i);
    }
    if (customId === 'embed:media-options-back') return updateMediaPanel(i);
    if (customId.startsWith('embed:media-type:')) {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return updateMediaPanel(i);
      const type = customId.split(':').pop();
      if (!['auto', 'image', 'video'].includes(type)) return true;
      const gallery = [...media.gallery];
      gallery[galleryIndex] = panel.mediaModel.normalizeGalleryItem({ ...gallery[galleryIndex], type });
      saveMediaState(i, state, { ...media, gallery }, { selectedMediaIndex: galleryIndex });
      return updateMediaOptions(i);
    }
    if (customId.startsWith('embed:media-spoiler:')) {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return updateMediaPanel(i);
      const gallery = [...media.gallery];
      gallery[galleryIndex] = panel.mediaModel.normalizeGalleryItem({ ...gallery[galleryIndex], spoiler: customId.endsWith(':on') });
      saveMediaState(i, state, { ...media, gallery }, { selectedMediaIndex: galleryIndex });
      return updateMediaOptions(i);
    }
    if (customId === 'embed:file-options') {
      if (fileIndex == null || !media.files[fileIndex]) { await i.reply({ content: 'Select an attached file first.', flags: 64 }); return true; }
      return updateFileOptions(i);
    }
    if (customId === 'embed:file-options-back') return updateMediaPanel(i);
    if (customId.startsWith('embed:file-spoiler:')) {
      if (fileIndex == null || !media.files[fileIndex]) return updateMediaPanel(i);
      const files = [...media.files];
      files[fileIndex] = panel.mediaModel.normalizeFile({ ...files[fileIndex], spoiler: customId.endsWith(':on') });
      saveMediaState(i, state, { ...media, files }, { selectedFileIndex: fileIndex });
      return updateFileOptions(i);
    }
    if (customId === 'embed:media-gallery-add') {
      if (media.gallery.length >= panel.mediaModel.MAX_GALLERY_ITEMS) { await i.reply({ content: `Maximum of ${panel.mediaModel.MAX_GALLERY_ITEMS} gallery items reached.`, flags: 64 }); return true; }
      await i.showModal(panel.galleryItemModal(state)); return true;
    }
    if (customId === 'embed:media-gallery-edit') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) { await i.reply({ content: 'Select a gallery item first.', flags: 64 }); return true; }
      await i.showModal(panel.galleryItemModal(state, galleryIndex)); return true;
    }
    if (customId === 'embed:media-gallery-remove') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return updateMediaPanel(i);
      const gallery = [...media.gallery]; gallery.splice(galleryIndex, 1);
      saveMediaState(i, state, { ...media, gallery }, { selectedMediaIndex: null });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-gallery-up' || customId === 'embed:media-gallery-down') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return updateMediaPanel(i);
      const target = galleryIndex + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= media.gallery.length) return updateMediaPanel(i);
      const gallery = [...media.gallery];
      [gallery[galleryIndex], gallery[target]] = [gallery[target], gallery[galleryIndex]];
      saveMediaState(i, state, { ...media, gallery }, { selectedMediaIndex: target });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-file-add') {
      if (media.files.length >= panel.mediaModel.MAX_FILES) { await i.reply({ content: `Maximum of ${panel.mediaModel.MAX_FILES} files reached.`, flags: 64 }); return true; }
      await i.showModal(panel.fileItemModal(state)); return true;
    }
    if (customId === 'embed:media-file-edit') {
      if (fileIndex == null || !media.files[fileIndex]) { await i.reply({ content: 'Select a file first.', flags: 64 }); return true; }
      await i.showModal(panel.fileItemModal(state, fileIndex)); return true;
    }
    if (customId === 'embed:media-file-remove') {
      if (fileIndex == null || !media.files[fileIndex]) return updateMediaPanel(i);
      const files = [...media.files]; files.splice(fileIndex, 1);
      saveMediaState(i, state, { ...media, files }, { selectedFileIndex: null });
      return updateMediaPanel(i);
    }
  }

  if (i.isModalSubmit?.() && customId === 'embed:media-upload-save') {
    const uploaded = i.fields.getUploadedFiles('media_files', true);
    const attachments = [...(uploaded?.values?.() || [])];
    if (!attachments.length) { await i.reply({ content: 'No files were uploaded.', flags: 64 }); return true; }
    const media = panel.getPanelMedia(state), gallery = [...media.gallery], files = [...media.files];
    let addedGallery = 0, addedFiles = 0, skipped = 0;
    for (const attachment of attachments) {
      await cacheUploadedAttachment(attachment);
      const kind = uploadType(attachment);
      if ((kind === 'image' || kind === 'video') && gallery.length < panel.mediaModel.MAX_GALLERY_ITEMS) {
        gallery.push(panel.mediaModel.normalizeGalleryItem({ source: attachment.url, alt: attachment.description || attachment.name || '', type: kind, spoiler: Boolean(attachment.spoiler) }));
        addedGallery += 1;
      } else if (files.length < panel.mediaModel.MAX_FILES) {
        files.push(panel.mediaModel.normalizeFile({ source: attachment.url, name: attachment.name || '', description: attachment.description || '', spoiler: Boolean(attachment.spoiler) }));
        addedFiles += 1;
      } else skipped += 1;
    }
    saveMediaState(i, state, { ...media, gallery, files }, {
      selectedMediaIndex: addedGallery ? gallery.length - 1 : state.selectedMediaIndex,
      selectedFileIndex: addedFiles ? files.length - 1 : state.selectedFileIndex,
    });
    await i.reply({ content: `✅ Added ${addedGallery} gallery media item(s) and ${addedFiles} attached file(s).${skipped ? ` ${skipped} item(s) were skipped because the panel limits were reached.` : ''}`, ...panel.buildMediaManagerPanel(i, who(i)), flags: 64 });
    return true;
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:save-content-clean:')) {
    panel.markUnsaved(i, panel.saveSelected(state, { title: i.fields.getTextInputValue('title'), description: i.fields.getTextInputValue('description') }));
    await i.reply({ ...panel.buildBuilderPanel(i, who(i)), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:media-thumbnail-save:')) {
    const media = panel.getPanelMedia(state);
    media.thumbnail = panel.mediaModel.normalizeThumbnail({ source: i.fields.getTextInputValue('source'), alt: i.fields.getTextInputValue('alt') });
    saveMediaState(i, state, media); return replyMediaPanel(i);
  }
  if (i.isModalSubmit?.() && (customId === 'embed:media-gallery-save-new' || customId.startsWith('embed:media-gallery-save:'))) {
    const media = panel.getPanelMedia(state);
    const editingIndex = customId === 'embed:media-gallery-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (media.gallery[editingIndex] || {}) : {};
    const entry = panel.mediaModel.normalizeGalleryItem({ source: i.fields.getTextInputValue('source'), alt: i.fields.getTextInputValue('alt'), type: existing.type || 'auto', spoiler: existing.spoiler === true });
    if (!entry.source) { await i.reply({ content: 'A media URL or variable is required.', flags: 64 }); return true; }
    const gallery = [...media.gallery]; let selectedMediaIndex;
    if (editingIndex == null) { if (gallery.length >= panel.mediaModel.MAX_GALLERY_ITEMS) { await i.reply({ content: 'Maximum gallery item limit reached.', flags: 64 }); return true; } gallery.push(entry); selectedMediaIndex = gallery.length - 1; }
    else { gallery[editingIndex] = entry; selectedMediaIndex = editingIndex; }
    saveMediaState(i, state, { ...media, gallery }, { selectedMediaIndex }); return replyMediaPanel(i);
  }
  if (i.isModalSubmit?.() && (customId === 'embed:media-file-save-new' || customId.startsWith('embed:media-file-save:'))) {
    const media = panel.getPanelMedia(state);
    const editingIndex = customId === 'embed:media-file-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (media.files[editingIndex] || {}) : {};
    const entry = panel.mediaModel.normalizeFile({ source: i.fields.getTextInputValue('source'), name: i.fields.getTextInputValue('name'), description: i.fields.getTextInputValue('description'), spoiler: existing.spoiler === true });
    if (!entry.source) { await i.reply({ content: 'A file URL or variable is required.', flags: 64 }); return true; }
    const files = [...media.files]; let selectedFileIndex;
    if (editingIndex == null) { if (files.length >= panel.mediaModel.MAX_FILES) { await i.reply({ content: 'Maximum file limit reached.', flags: 64 }); return true; } files.push(entry); selectedFileIndex = files.length - 1; }
    else { files[editingIndex] = entry; selectedFileIndex = editingIndex; }
    saveMediaState(i, state, { ...media, files }, { selectedFileIndex }); return replyMediaPanel(i);
  }

  if (customId === 'embed:test-send') {
    try { const payload = await buildPayload(state, i, true); payload.allowedMentions = panel.allowedMentions(state, i); await i.reply(payload); }
    catch (error) { console.error('[Embed] test payload failed:', error); await i.reply({ content: `❌ Embed test failed: ${error?.message || error}`, flags: 64 }); }
    return true;
  }

  if (customId === 'embed:update-existing') {
    const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(state));
    if (!deployment) return original.handleInteraction(i);
    const channel = i.guild.channels.cache.get(deployment.channelId) || await i.guild.channels.fetch(deployment.channelId).catch(() => null);
    if (!isTextBasedChannel(channel)) { await i.reply({ content: '⚠️ The original embed channel no longer exists or is not text-based.', flags: 64 }); return true; }
    const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.update' });
    if (!access.ok) { await i.reply({ content: panel.trim(access.message, 1800), flags: 64 }); return true; }
    const message = await channel.messages.fetch(deployment.messageId).catch(() => null);
    if (!message || !message.flags?.has?.(MessageFlags.IsComponentsV2)) return original.handleInteraction(i);
    try {
      const payload = await buildPayload(state, i, false); payload.allowedMentions = panel.allowedMentions(state, i);
      await message.edit(payload);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState(state), { ...deployment, lastUpdatedBy: i.user.id });
      await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
    } catch (error) { await i.reply({ content: panel.embedOperationError(error, channel.id, 'update'), flags: 64 }); }
    return true;
  }

  if (customId === 'embed:use') {
    const channel = i.guild.channels.cache.get(state.channelId) || await i.guild.channels.fetch(state.channelId).catch(() => null);
    if (!isTextBasedChannel(channel)) { await i.reply({ content: 'Invalid channel.', flags: 64 }); return true; }
    const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.deploy' });
    if (!access.ok) { await i.reply({ content: panel.trim(access.message, 1800), flags: 64 }); return true; }
    try {
      const payload = await buildPayload(state, i, false); payload.allowedMentions = panel.allowedMentions(state, i);
      const sent = await channel.send(payload);
      const presetName = `auto-${state.template || 'custom'}`;
      guildManager.saveEmbedPreset(i.guild.id, presetName, panel.presetData(state), i.guild);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState({ ...state, selectedPreset: presetName }), { channelId: channel.id, messageId: sent.id, template: state.template, preset: presetName, createdBy: i.user.id, lastUpdatedBy: i.user.id });
      const ok = panel.setDefault(i.guild.id, state.template, presetName);
      panel.clearUnsaved(i, { ...state, selectedPreset: presetName });
      await i.reply({ content: ok ? `✅ Embed posted to <#${state.channelId}> and saved as active` : '⚠️ Preset saved, but default assignment failed.', flags: 64 });
    } catch (error) { await i.reply({ content: panel.embedOperationError(error, channel.id, 'send'), flags: 64 }); }
    return true;
  }

  return original.handleInteraction(i);
}

module.exports = { handleInteraction };
