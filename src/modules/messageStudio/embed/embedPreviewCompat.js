'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedPanel');
const { persistPresetMedia } = require('./embedAssetStore');
const mediaModel = require('./embedMediaModel');

function queuePersistentMediaImport(presetLike) {
  persistPresetMedia('global', presetLike).then((results) => {
    const failed = results.filter((result) => !result.ok);
    if (failed.length) console.warn('[EmbedAssets] persistence import failed:', failed.map((result) => ({ url: String(result.url).slice(0, 120), error: result.error })));
  }).catch((error) => console.warn('[EmbedAssets] persistence import failed:', error?.message || error));
}
function textInput(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));
}
function shortSource(value) {
  const source = String(value || '');
  return source.length > 72 ? `${source.slice(0, 69)}...` : source || 'Not set';
}

panel.contentModal = (state) => new ModalBuilder()
  .setCustomId(`embed:save-content-clean:${Date.now()}`)
  .setTitle('Edit Panel Text')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('title', 'Panel title', TextInputStyle.Short, state.title, 256)),
    new ActionRowBuilder().addComponents(textInput('description', 'Panel message/content', TextInputStyle.Paragraph, state.description, 4000)),
  );
panel.mediaModal = (state) => new ModalBuilder()
  .setCustomId(`embed:save-appearance:${Date.now()}`)
  .setTitle('Media & Appearance')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('authorName', 'Author name', TextInputStyle.Short, state.authorName, 256)),
    new ActionRowBuilder().addComponents(textInput('authorIcon', 'Author logo URL / variable', TextInputStyle.Short, state.authorIcon)),
    new ActionRowBuilder().addComponents(textInput('authorUrl', 'Author clickable URL', TextInputStyle.Short, state.authorUrl)),
    new ActionRowBuilder().addComponents(textInput('footer', 'Footer text', TextInputStyle.Short, state.footer, 2048)),
    new ActionRowBuilder().addComponents(textInput('footerIcon', 'Footer icon URL / variable', TextInputStyle.Short, state.footerIcon)),
  );
panel.imageModal = (state) => new ModalBuilder()
  .setCustomId(`embed:save-images:${Date.now()}`)
  .setTitle('Panel Images')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('thumbnail', 'Small thumbnail URL / variable', TextInputStyle.Short, state.thumbnail)),
    new ActionRowBuilder().addComponents(textInput('image', 'Primary image URL / variable', TextInputStyle.Short, state.image)),
  );

panel.thumbnailModal = (state) => {
  const thumbnail = mediaModel.mediaForPanel(state).thumbnail || {};
  return new ModalBuilder()
    .setCustomId(`embed:media-thumbnail-save:${Date.now()}`)
    .setTitle('Edit Thumbnail')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'Thumbnail URL / variable', TextInputStyle.Short, thumbnail.source || '')),
      new ActionRowBuilder().addComponents(textInput('alt', 'Thumbnail alt text', TextInputStyle.Paragraph, thumbnail.alt || '', 1024)),
    );
};
panel.galleryItemModal = (state, index = null) => {
  const media = mediaModel.mediaForPanel(state);
  const item = Number.isInteger(index) ? (media.gallery[index] || {}) : {};
  const customId = Number.isInteger(index) ? `embed:media-gallery-save:${index}` : 'embed:media-gallery-save-new';
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(Number.isInteger(index) ? 'Edit Gallery Media' : 'Add Gallery Media')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'Media URL / variable', TextInputStyle.Short, item.source || '')),
      new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, item.alt || '', 1024)),
      new ActionRowBuilder().addComponents(textInput('type', 'Type: auto, image or video', TextInputStyle.Short, item.type || 'auto', 10)),
      new ActionRowBuilder().addComponents(textInput('spoiler', 'Spoiler? yes / no', TextInputStyle.Short, item.spoiler ? 'yes' : 'no', 5)),
    );
};
panel.fileItemModal = (state, index = null) => {
  const media = mediaModel.mediaForPanel(state);
  const item = Number.isInteger(index) ? (media.files[index] || {}) : {};
  const customId = Number.isInteger(index) ? `embed:media-file-save:${index}` : 'embed:media-file-save-new';
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(Number.isInteger(index) ? 'Edit Attached File' : 'Add Attached File')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'File URL / variable', TextInputStyle.Short, item.source || '')),
      new ActionRowBuilder().addComponents(textInput('name', 'Display filename', TextInputStyle.Short, item.name || '', 256)),
      new ActionRowBuilder().addComponents(textInput('description', 'File description', TextInputStyle.Paragraph, item.description || '', 1024)),
      new ActionRowBuilder().addComponents(textInput('spoiler', 'Spoiler? yes / no', TextInputStyle.Short, item.spoiler ? 'yes' : 'no', 5)),
    );
};

panel.buildMediaManagerPanel = (interaction, requestedBy = null) => {
  const state = panel.getSession(interaction);
  const media = mediaModel.mediaForPanel(state);
  const galleryIndex = Number.isInteger(state.selectedMediaIndex) && media.gallery[state.selectedMediaIndex] ? state.selectedMediaIndex : null;
  const fileIndex = Number.isInteger(state.selectedFileIndex) && media.files[state.selectedFileIndex] ? state.selectedFileIndex : null;
  const galleryItem = galleryIndex == null ? null : media.gallery[galleryIndex];
  const fileItem = fileIndex == null ? null : media.files[fileIndex];
  const lines = [
    `**Panel:** ${(Number(state.selectedPanelIndex) || 0) + 1} / ${state.panels?.length || 1}`,
    `**Thumbnail:** ${media.thumbnail?.source ? shortSource(media.thumbnail.source) : 'Not set'}`,
    `**Gallery:** ${media.gallery.length}/${mediaModel.MAX_GALLERY_ITEMS}`,
    `**Files:** ${media.files.length}/${mediaModel.MAX_FILES}`,
    '',
    galleryItem ? `**Selected gallery ${galleryIndex + 1}:** ${shortSource(galleryItem.source)}\nType: ${galleryItem.type || 'auto'} • Spoiler: ${galleryItem.spoiler ? 'Yes' : 'No'}${galleryItem.alt ? `\nAlt: ${galleryItem.alt.slice(0, 300)}` : ''}` : '**Selected gallery:** None',
    '',
    fileItem ? `**Selected file ${fileIndex + 1}:** ${fileItem.name || shortSource(fileItem.source)}\n${shortSource(fileItem.source)}${fileItem.description ? `\n${fileItem.description.slice(0, 300)}` : ''}` : '**Selected file:** None',
    '',
    'Sources support direct HTTPS links and Embed Studio variables. Existing single-image presets remain backwards compatible.',
  ];
  const components = [];
  if (media.gallery.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:media-gallery-select').setPlaceholder('Select gallery media').setMinValues(1).setMaxValues(1)
        .addOptions(media.gallery.map((item, index) => ({
          label: `${index + 1}. ${item.type === 'video' ? 'Video' : item.type === 'image' ? 'Image' : 'Media'}${item.spoiler ? ' • spoiler' : ''}`.slice(0, 100),
          value: String(index),
          description: shortSource(item.source).slice(0, 100),
          default: index === galleryIndex,
        }))),
    ));
  }
  if (media.files.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:media-file-select').setPlaceholder('Select attached file').setMinValues(1).setMaxValues(1)
        .addOptions(media.files.map((item, index) => ({
          label: `${index + 1}. ${item.name || 'File'}`.slice(0, 100),
          value: String(index),
          description: shortSource(item.source).slice(0, 100),
          default: index === fileIndex,
        }))),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:media-thumbnail').setLabel('🖼️ Thumbnail').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:media-gallery-add').setLabel('➕ Add Media').setStyle(ButtonStyle.Primary).setDisabled(media.gallery.length >= mediaModel.MAX_GALLERY_ITEMS),
    new ButtonBuilder().setCustomId('embed:media-gallery-edit').setLabel('✏️ Edit Media').setStyle(ButtonStyle.Secondary).setDisabled(galleryIndex == null),
    new ButtonBuilder().setCustomId('embed:media-gallery-remove').setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger).setDisabled(galleryIndex == null),
  ));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:media-gallery-up').setLabel('⬆️ Media').setStyle(ButtonStyle.Secondary).setDisabled(galleryIndex == null || galleryIndex <= 0),
    new ButtonBuilder().setCustomId('embed:media-gallery-down').setLabel('⬇️ Media').setStyle(ButtonStyle.Secondary).setDisabled(galleryIndex == null || galleryIndex >= media.gallery.length - 1),
    new ButtonBuilder().setCustomId('embed:media-file-add').setLabel('📎 Add File').setStyle(ButtonStyle.Primary).setDisabled(media.files.length >= mediaModel.MAX_FILES),
    new ButtonBuilder().setCustomId('embed:media-file-edit').setLabel('✏️ Edit File').setStyle(ButtonStyle.Secondary).setDisabled(fileIndex == null),
    new ButtonBuilder().setCustomId('embed:media-file-remove').setLabel('🗑️ File').setStyle(ButtonStyle.Danger).setDisabled(fileIndex == null),
  ));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
  ));
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Media Manager').setDescription(lines.join('\n')).setFooter({ text: `Requested by ${requestedBy || panel.memberName(interaction)}` }).setTimestamp()],
    components,
  };
};
panel.buildMediaManager = panel.buildMediaManagerPanel;

if (!panel.__mediaV2Patched) {
  if (typeof panel.getSession === 'function') {
    const originalGetSession = panel.getSession.bind(panel);
    panel.getSession = (interaction) => mediaModel.ensureStateMedia(originalGetSession(interaction));
  }
  if (typeof panel.saveSession === 'function') {
    const originalSaveSession = panel.saveSession.bind(panel);
    panel.saveSession = (interaction, state) => originalSaveSession(interaction, mediaModel.ensureStateMedia(state));
  }
  if (typeof panel.markUnsaved === 'function') {
    const originalMarkUnsaved = panel.markUnsaved.bind(panel);
    panel.markUnsaved = (interaction, state) => {
      const previous = panel.getSession(interaction);
      return originalMarkUnsaved(interaction, mediaModel.reconcileMediaByPanels(previous, state));
    };
  }
  if (typeof panel.resetSession === 'function') {
    const originalResetSession = panel.resetSession.bind(panel);
    panel.resetSession = (interaction) => {
      const result = originalResetSession(interaction);
      return panel.saveSession(interaction, mediaModel.ensureStateMedia(result));
    };
  }
  if (typeof panel.applyTemplate === 'function') {
    const originalApplyTemplate = panel.applyTemplate.bind(panel);
    panel.applyTemplate = (interaction, name) => {
      const result = originalApplyTemplate(interaction, name);
      return panel.saveSession(interaction, mediaModel.ensureStateMedia({ ...result, mediaV2: undefined }));
    };
  }
  if (typeof panel.applyPreset === 'function') {
    const originalApplyPreset = panel.applyPreset.bind(panel);
    panel.applyPreset = (interaction, name, preset) => {
      const result = originalApplyPreset(interaction, name, preset);
      const restored = mediaModel.ensureStateMedia({ ...result, mediaV2: preset?.mediaV2 || result?.mediaV2 });
      return panel.saveSession(interaction, restored);
    };
  }
  panel.getPanelMedia = (state, index = null) => mediaModel.mediaForPanel(state, index);
  panel.setPanelMedia = (state, index, media) => mediaModel.setPanelMedia(state, index, media);
  panel.mediaModel = mediaModel;
  panel.__mediaV2Patched = true;
}

if (!panel.__persistentMediaPatched && typeof panel.saveSelected === 'function') {
  const originalSaveSelected = panel.saveSelected.bind(panel);
  panel.saveSelected = (state, patch = {}) => {
    let result = originalSaveSelected(state, patch);
    result = mediaModel.syncLegacyPatch({ ...result, mediaV2: state?.mediaV2 }, patch);
    if (['image', 'thumbnail', 'authorIcon', 'footerIcon'].some((key) => patch && patch[key])) queuePersistentMediaImport({ panels: [patch], mediaV2: result.mediaV2 });
    return result;
  };
  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (state) => {
      const safeState = mediaModel.ensureStateMedia(state);
      const preset = { ...originalPresetData(safeState), mediaV2: safeState.mediaV2 };
      queuePersistentMediaImport(preset);
      return preset;
    };
  }
  panel.__persistentMediaPatched = true;
}

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;
    return function compactPreviewBuilder(interaction, ...args) {
      const payload = builder(interaction, ...args);
      if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 2) return payload;
      const state = typeof panel.getSession === 'function' ? panel.getSession(interaction) : null;
      const selectedIndex = Math.max(0, Number(state?.selectedPanelIndex) || 0);
      const selectedPreview = payload.embeds[selectedIndex + 1] || payload.embeds[1];
      return { ...payload, embeds: selectedPreview ? [payload.embeds[0], selectedPreview] : [payload.embeds[0]] };
    };
  }
  panel.buildEditorPanel = compactPreviewPayload(panel.buildEditorPanel);
  panel.buildPanelsPanel = compactPreviewPayload(panel.buildPanelsPanel);
  const originalBuilderPanel = panel.buildBuilderPanel.bind(panel);
  panel.buildBuilderPanel = compactPreviewPayload((interaction, ...args) => {
    const payload = originalBuilderPanel(interaction, ...args);
    const firstRow = payload?.components?.[0];
    if (firstRow?.components?.length) {
      const mediaButton = firstRow.components.find((component) => component?.data?.custom_id === 'embed:edit-media');
      if (mediaButton) mediaButton.setLabel('🎨 Appearance');
      const imageButton = firstRow.components.find((component) => component?.data?.custom_id === 'embed:edit-images');
      if (imageButton) imageButton.setLabel('🖼️ Media');
      else firstRow.addComponents(new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🖼️ Media').setStyle(ButtonStyle.Primary));
    }
    return payload;
  });
  panel.__compactPreviewPatched = true;
}

module.exports = panel;
