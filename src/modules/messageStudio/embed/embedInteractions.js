'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const original = require('./embedInteractionsLegacy');
const panel = require('./embedMediaUploadCompat');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const { ensureAssetCached } = require('./embedAssetStore');
const {
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeployments');
const { buildEmbedPayload } = require('./embedRenderer');

const {
  trim,
  embedOperationError,
  getSession,
  saveSession,
  saveSelected,
  markUnsaved,
  allowedMentions,
  presetData,
  setDefault,
  clearUnsaved,
  buildPreviewEmbeds,
  buildBuilderPanel,
  buildMediaManagerPanel,
  buildMediaOptionsPanel,
  buildFileOptionsPanel,
  buttonRows,
  thumbnailModal,
  galleryItemModal,
  fileItemModal,
  mediaUploadModal,
  mediaModel,
} = panel;

function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}
function who(i) { return panel.memberName(i); }
function saveMediaState(i, state, media, extra = {}) {
  const index = state.selectedPanelIndex || 0;
  let next = panel.setPanelMedia(state, index, media);
  const current = panel.getPanelMedia(next, index);
  next = saveSelected(next, { image: current.gallery?.[0]?.source || '', thumbnail: current.thumbnail?.source || '' });
  next = { ...next, ...extra, hasUnsavedChanges: true };
  return saveSession(i, next);
}
async function updateMediaPanel(i) { await i.update(buildMediaManagerPanel(i, who(i))); return true; }
async function updateMediaOptions(i) { await i.update(buildMediaOptionsPanel(i)); return true; }
async function updateFileOptions(i) { await i.update(buildFileOptionsPanel(i)); return true; }
async function replyMediaPanel(i) { await i.reply({ ...buildMediaManagerPanel(i, who(i)), flags: 64 }); return true; }
async function buildPayload(state, interaction, ephemeral = false) {
  return buildEmbedPayload({
    embeds: buildPreviewEmbeds(state, interaction),
    actionRows: buttonRows(state),
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
  const s = getSession(i);

  if (customId === 'embed:edit-images' && i.isButton?.()) return updateMediaPanel(i);
  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:media-gallery-select') {
      saveSession(i, { ...s, selectedMediaIndex: Number(i.values[0]) });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-file-select') {
      saveSession(i, { ...s, selectedFileIndex: Number(i.values[0]) });
      return updateMediaPanel(i);
    }
  }

  if (i.isButton?.()) {
    const media = panel.getPanelMedia(s);
    const galleryIndex = Number.isInteger(s.selectedMediaIndex) ? s.selectedMediaIndex : null;
    const fileIndex = Number.isInteger(s.selectedFileIndex) ? s.selectedFileIndex : null;
    if (customId === 'embed:media-upload') { await i.showModal(mediaUploadModal()); return true; }
    if (customId === 'embed:media-thumbnail') { await i.showModal(thumbnailModal(s)); return true; }
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
      gallery[galleryIndex] = mediaModel.normalizeGalleryItem({ ...gallery[galleryIndex], type });
      saveMediaState(i, s, { ...media, gallery }, { selectedMediaIndex: galleryIndex });
      return updateMediaOptions(i);
    }
    if (customId.startsWith('embed:media-spoiler:')) {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return updateMediaPanel(i);
      const spoiler = customId.endsWith(':on');
      const gallery = [...media.gallery];
      gallery[galleryIndex] = mediaModel.normalizeGalleryItem({ ...gallery[galleryIndex], spoiler });
      saveMediaState(i, s, { ...media, gallery }, { selectedMediaIndex: galleryIndex });
      return updateMediaOptions(i);
    }
    if (customId === 'embed:file-options') {
      if (fileIndex == null || !media.files[fileIndex]) { await i.reply({ content: 'Select an attached file first.', flags: 64 }); return true; }
      return updateFileOptions(i);
    }
    if (customId === 'embed:file-options-back') return updateMediaPanel(i);
    if (customId.startsWith('embed:file-spoiler:')) {
      if (fileIndex == null || !media.files[fileIndex]) return updateMediaPanel(i);
      const spoiler = customId.endsWith(':on');
      const files = [...media.files];
      files[fileIndex] = mediaModel.normalizeFile({ ...files[fileIndex], spoiler });
      saveMediaState(i, s, { ...media, files }, { selectedFileIndex: fileIndex });
      return updateFileOptions(i);
    }
    if (customId === 'embed:media-gallery-add') {
      if (media.gallery.length >= mediaModel.MAX_GALLERY_ITEMS) { await i.reply({ content: `Maximum of ${mediaModel.MAX_GALLERY_ITEMS} gallery items reached.`, flags: 64 }); return true; }
      await i.showModal(galleryItemModal(s)); return true;
    }
    if (customId === 'embed:media-gallery-edit') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) { await i.reply({ content: 'Select a gallery item first.', flags: 64 }); return true; }
      await i.showModal(galleryItemModal(s, galleryIndex)); return true;
    }
    if (customId === 'embed:media-gallery-remove') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return true;
      const gallery = [...media.gallery]; gallery.splice(galleryIndex, 1);
      saveMediaState(i, s, { ...media, gallery }, { selectedMediaIndex: null });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-gallery-up' || customId === 'embed:media-gallery-down') {
      if (galleryIndex == null || !media.gallery[galleryIndex]) return true;
      const target = galleryIndex + (customId.endsWith('up') ? -1 : 1);
      if (target < 0 || target >= media.gallery.length) return true;
      const gallery = [...media.gallery];
      [gallery[galleryIndex], gallery[target]] = [gallery[target], gallery[galleryIndex]];
      saveMediaState(i, s, { ...media, gallery }, { selectedMediaIndex: target });
      return updateMediaPanel(i);
    }
    if (customId === 'embed:media-file-add') {
      if (media.files.length >= mediaModel.MAX_FILES) { await i.reply({ content: `Maximum of ${mediaModel.MAX_FILES} files reached.`, flags: 64 }); return true; }
      await i.showModal(fileItemModal(s)); return true;
    }
    if (customId === 'embed:media-file-edit') {
      if (fileIndex == null || !media.files[fileIndex]) { await i.reply({ content: 'Select a file first.', flags: 64 }); return true; }
      await i.showModal(fileItemModal(s, fileIndex)); return true;
    }
    if (customId === 'embed:media-file-remove') {
      if (fileIndex == null || !media.files[fileIndex]) return true;
      const files = [...media.files]; files.splice(fileIndex, 1);
      saveMediaState(i, s, { ...media, files }, { selectedFileIndex: null });
      return updateMediaPanel(i);
    }
  }

  if (i.isModalSubmit?.() && customId === 'embed:media-upload-save') {
    const uploaded = i.fields.getUploadedFiles('media_files', true);
    const attachments = [...(uploaded?.values?.() || [])];
    if (!attachments.length) { await i.reply({ content: 'No files were uploaded.', flags: 64 }); return true; }

    const media = panel.getPanelMedia(s);
    const gallery = [...media.gallery];
    const files = [...media.files];
    let addedGallery = 0;
    let addedFiles = 0;
    let skipped = 0;

    for (const attachment of attachments) {
      await cacheUploadedAttachment(attachment);
      const kind = uploadType(attachment);
      if ((kind === 'image' || kind === 'video') && gallery.length < mediaModel.MAX_GALLERY_ITEMS) {
        gallery.push(mediaModel.normalizeGalleryItem({
          source: attachment.url,
          alt: attachment.description || attachment.name || '',
          type: kind,
          spoiler: Boolean(attachment.spoiler),
        }));
        addedGallery += 1;
      } else if (files.length < mediaModel.MAX_FILES) {
        files.push(mediaModel.normalizeFile({
          source: attachment.url,
          name: attachment.name || '',
          description: attachment.description || '',
          spoiler: Boolean(attachment.spoiler),
        }));
        addedFiles += 1;
      } else skipped += 1;
    }

    saveMediaState(i, s, { ...media, gallery, files }, {
      selectedMediaIndex: addedGallery ? gallery.length - 1 : s.selectedMediaIndex,
      selectedFileIndex: addedFiles ? files.length - 1 : s.selectedFileIndex,
    });
    const summary = `✅ Added ${addedGallery} gallery media item(s) and ${addedFiles} attached file(s).${skipped ? ` ${skipped} item(s) could not be added because the panel limits were reached.` : ''}`;
    await i.reply({ content: summary, ...buildMediaManagerPanel(i, who(i)), flags: 64 });
    return true;
  }

  if (i.isModalSubmit?.() && customId.startsWith('embed:save-content-clean:')) {
    markUnsaved(i, saveSelected(s, { title: i.fields.getTextInputValue('title'), description: i.fields.getTextInputValue('description') }));
    await i.reply({ ...buildBuilderPanel(i, who(i)), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:save-appearance:')) {
    markUnsaved(i, saveSelected(s, {
      authorName: i.fields.getTextInputValue('authorName'), authorIcon: i.fields.getTextInputValue('authorIcon'), authorUrl: i.fields.getTextInputValue('authorUrl'),
      footer: i.fields.getTextInputValue('footer'), footerIcon: i.fields.getTextInputValue('footerIcon'),
    }));
    await i.reply({ ...buildBuilderPanel(i, who(i)), flags: 64 }); return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:media-thumbnail-save:')) {
    const media = panel.getPanelMedia(s);
    media.thumbnail = mediaModel.normalizeThumbnail({ source: i.fields.getTextInputValue('source'), alt: i.fields.getTextInputValue('alt') });
    saveMediaState(i, s, media); return replyMediaPanel(i);
  }
  if (i.isModalSubmit?.() && (customId === 'embed:media-gallery-save-new' || customId.startsWith('embed:media-gallery-save:'))) {
    const media = panel.getPanelMedia(s);
    const editingIndex = customId === 'embed:media-gallery-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (media.gallery[editingIndex] || {}) : {};
    const entry = mediaModel.normalizeGalleryItem({
      source: i.fields.getTextInputValue('source'),
      alt: i.fields.getTextInputValue('alt'),
      type: existing.type || 'auto',
      spoiler: existing.spoiler === true,
    });
    if (!entry.source) { await i.reply({ content: 'A media URL or variable is required.', flags: 64 }); return true; }
    const gallery = [...media.gallery]; let selectedMediaIndex;
    if (customId === 'embed:media-gallery-save-new') {
      if (gallery.length >= mediaModel.MAX_GALLERY_ITEMS) { await i.reply({ content: `Maximum of ${mediaModel.MAX_GALLERY_ITEMS} gallery items reached.`, flags: 64 }); return true; }
      gallery.push(entry); selectedMediaIndex = gallery.length - 1;
    } else { selectedMediaIndex = editingIndex; gallery[selectedMediaIndex] = entry; }
    saveMediaState(i, s, { ...media, gallery }, { selectedMediaIndex }); return replyMediaPanel(i);
  }
  if (i.isModalSubmit?.() && (customId === 'embed:media-file-save-new' || customId.startsWith('embed:media-file-save:'))) {
    const media = panel.getPanelMedia(s);
    const editingIndex = customId === 'embed:media-file-save-new' ? null : Number(customId.split(':').pop());
    const existing = Number.isInteger(editingIndex) ? (media.files[editingIndex] || {}) : {};
    const entry = mediaModel.normalizeFile({
      source: i.fields.getTextInputValue('source'),
      name: i.fields.getTextInputValue('name'),
      description: i.fields.getTextInputValue('description'),
      spoiler: existing.spoiler === true,
    });
    if (!entry.source) { await i.reply({ content: 'A file URL or variable is required.', flags: 64 }); return true; }
    const files = [...media.files]; let selectedFileIndex;
    if (customId === 'embed:media-file-save-new') {
      if (files.length >= mediaModel.MAX_FILES) { await i.reply({ content: `Maximum of ${mediaModel.MAX_FILES} files reached.`, flags: 64 }); return true; }
      files.push(entry); selectedFileIndex = files.length - 1;
    } else { selectedFileIndex = editingIndex; files[selectedFileIndex] = entry; }
    saveMediaState(i, s, { ...media, files }, { selectedFileIndex }); return replyMediaPanel(i);
  }

  if (customId === 'embed:update-existing') {
    const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s));
    if (!deployment) return original.handleInteraction(i);
    const channel = i.guild.channels.cache.get(deployment.channelId) || (await i.guild.channels.fetch(deployment.channelId).catch(() => null));
    if (!isTextBasedChannel(channel)) { await i.reply({ content: '⚠️ The original embed channel no longer exists or is not text-based.', flags: 64 }); return true; }
    const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.update' });
    if (!access.ok) { await i.reply({ content: trim(access.message, 1800), flags: 64 }); return true; }
    let message; try { message = await channel.messages.fetch(deployment.messageId); } catch { return original.handleInteraction(i); }
    if (!message.flags?.has?.(MessageFlags.IsComponentsV2)) return original.handleInteraction(i);
    try {
      const payload = await buildPayload(s, i, false); payload.allowedMentions = allowedMentions(s, i);
      await message.edit(payload);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s), { ...deployment, lastUpdatedBy: i.user.id });
      await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
    } catch (error) { console.error('[Embed] failed to update existing embed:', error); await i.reply({ content: embedOperationError(error, channel.id, 'update'), flags: 64 }); }
    return true;
  }

  if (customId !== 'embed:test-send' && customId !== 'embed:use') return original.handleInteraction(i);
  if (customId === 'embed:test-send') {
    try { const payload = await buildPayload(s, i, true); payload.allowedMentions = allowedMentions(s, i); await i.reply(payload); }
    catch (error) { console.error('[Embed] test payload failed:', error); await i.reply({ content: `❌ Embed test failed: ${error?.message || error}`, flags: 64 }); }
    return true;
  }

  const channel = i.guild.channels.cache.get(s.channelId) || (await i.guild.channels.fetch(s.channelId).catch(() => null));
  if (!isTextBasedChannel(channel)) { await i.reply({ content: 'Invalid channel.', flags: 64 }); return true; }
  const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.deploy' });
  if (!access.ok) { await i.reply({ content: trim(access.message, 1800), flags: 64 }); return true; }
  let payload;
  try { payload = await buildPayload(s, i, false); payload.allowedMentions = allowedMentions(s, i); }
  catch (error) { console.error('[Embed] deploy payload failed:', error); await i.reply({ content: `❌ Embed could not be built: ${error?.message || error}`, flags: 64 }); return true; }
  let sent;
  try { sent = await channel.send(payload); } catch (error) { console.error('[Embed] send failed:', error); await i.reply({ content: embedOperationError(error, channel.id, 'send'), flags: 64 }); return true; }
  const presetName = `auto-${s.template || 'custom'}`;
  guildManager.saveEmbedPreset(i.guild.id, presetName, presetData(s), i.guild);
  saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState({ ...s, selectedPreset: presetName }), { channelId: channel.id, messageId: sent.id, template: s.template, preset: presetName, createdBy: i.user.id, lastUpdatedBy: i.user.id });
  const ok = setDefault(i.guild.id, s.template, presetName);
  clearUnsaved(i, { ...s, selectedPreset: presetName });
  await i.reply({ content: ok ? `✅ Embed posted to <#${s.channelId}> and saved as active` : '⚠️ Preset saved, but default assignment failed.', flags: 64 });
  return true;
}

module.exports = { handleInteraction };
