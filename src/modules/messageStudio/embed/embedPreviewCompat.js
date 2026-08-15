'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

function mediaButton(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
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

panel.thumbnailModal = (state) => {
  const media = mediaModel.mediaForPanel(state);
  return new ModalBuilder().setCustomId(`embed:media-thumbnail-save:${Date.now()}`).setTitle('Thumbnail').addComponents(
    new ActionRowBuilder().addComponents(textInput('source', 'Image URL / variable', TextInputStyle.Short, media.thumbnail?.source || state.thumbnail)),
    new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, media.thumbnail?.alt || '', 1024)),
  );
};

panel.galleryItemModal = (state, index = null) => {
  const media = mediaModel.mediaForPanel(state);
  const item = Number.isInteger(index) ? media.gallery[index] || {} : {};
  return new ModalBuilder()
    .setCustomId(Number.isInteger(index) ? `embed:media-gallery-save:${index}` : 'embed:media-gallery-save-new')
    .setTitle(Number.isInteger(index) ? 'Edit Media Item' : 'Add Media Item')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'Media URL / variable', TextInputStyle.Short, item.source || '')),
      new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, item.alt || '', 1024)),
      new ActionRowBuilder().addComponents(textInput('type', 'Type: auto / image / video', TextInputStyle.Short, item.type || 'auto', 10)),
      new ActionRowBuilder().addComponents(textInput('spoiler', 'Spoiler? yes / no', TextInputStyle.Short, item.spoiler ? 'yes' : 'no', 10)),
    );
};

panel.fileItemModal = (state, index = null) => {
  const media = mediaModel.mediaForPanel(state);
  const item = Number.isInteger(index) ? media.files[index] || {} : {};
  return new ModalBuilder()
    .setCustomId(Number.isInteger(index) ? `embed:media-file-save:${index}` : 'embed:media-file-save-new')
    .setTitle(Number.isInteger(index) ? 'Edit Attached File' : 'Add Attached File')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'File URL / variable', TextInputStyle.Short, item.source || '')),
      new ActionRowBuilder().addComponents(textInput('name', 'Display filename', TextInputStyle.Short, item.name || '', 256)),
      new ActionRowBuilder().addComponents(textInput('description', 'Description', TextInputStyle.Paragraph, item.description || '', 1024)),
      new ActionRowBuilder().addComponents(textInput('spoiler', 'Spoiler? yes / no', TextInputStyle.Short, item.spoiler ? 'yes' : 'no', 10)),
    );
};

panel.buildMediaManagerPanel = (interaction, who = 'Unknown User') => {
  const state = panel.getSession(interaction);
  const media = mediaModel.mediaForPanel(state);
  const galleryIndex = Number.isInteger(state.selectedMediaIndex) && state.selectedMediaIndex < media.gallery.length ? state.selectedMediaIndex : null;
  const fileIndex = Number.isInteger(state.selectedFileIndex) && state.selectedFileIndex < media.files.length ? state.selectedFileIndex : null;
  const rows = [];

  if (media.gallery.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:media-gallery-select').setPlaceholder('🖼️ Select gallery item').addOptions(
        media.gallery.map((item, index) => ({
          label: `${index + 1}. ${panel.trim(item.alt || item.source || 'Media item', 90)}`,
          value: String(index),
          description: panel.trim(`${item.type || 'auto'}${item.spoiler ? ' • spoiler' : ''} • ${item.source || ''}`, 100),
          default: galleryIndex === index,
        })),
      ),
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    mediaButton('embed:media-gallery-add', `➕ Add Media (${media.gallery.length}/${mediaModel.MAX_GALLERY_ITEMS})`, ButtonStyle.Success, media.gallery.length >= mediaModel.MAX_GALLERY_ITEMS),
    mediaButton('embed:media-gallery-edit', '✏️ Edit', ButtonStyle.Primary, galleryIndex == null),
    mediaButton('embed:media-gallery-remove', '🗑️ Remove', ButtonStyle.Danger, galleryIndex == null),
    mediaButton('embed:media-gallery-up', '⬆️', ButtonStyle.Secondary, galleryIndex == null || galleryIndex <= 0),
    mediaButton('embed:media-gallery-down', '⬇️', ButtonStyle.Secondary, galleryIndex == null || galleryIndex >= media.gallery.length - 1),
  ));

  if (media.files.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:media-file-select').setPlaceholder('📎 Select attached file').addOptions(
        media.files.map((item, index) => ({
          label: `${index + 1}. ${panel.trim(item.name || item.source || 'File', 90)}`,
          value: String(index),
          description: panel.trim(item.description || item.source || 'Attached file', 100),
          default: fileIndex === index,
        })),
      ),
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    mediaButton('embed:media-thumbnail', media.thumbnail?.source ? '🖼️ Edit Thumbnail' : '🖼️ Add Thumbnail', ButtonStyle.Primary),
    mediaButton('embed:media-file-add', `📎 Add File (${media.files.length}/${mediaModel.MAX_FILES})`, ButtonStyle.Success, media.files.length >= mediaModel.MAX_FILES),
    mediaButton('embed:media-file-edit', '✏️ Edit File', ButtonStyle.Secondary, fileIndex == null),
    mediaButton('embed:media-file-remove', '🗑️ Remove File', ButtonStyle.Danger, fileIndex == null),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    mediaButton('embed:builder', '⬅️ Builder'),
    mediaButton('embed:helpers', '📖 Variables'),
  ));

  return {
    embeds: [panel.simplePanel(
      '🖼️ Media Manager',
      [
        `Editing panel **${state.selectedPanelIndex + 1}/${state.panels.length}**.`,
        '',
        `**Thumbnail:** ${media.thumbnail?.source ? '✅ Configured' : '— None'}`,
        `**Gallery:** ${media.gallery.length}/${mediaModel.MAX_GALLERY_ITEMS} item(s)`,
        `**Files:** ${media.files.length}/${mediaModel.MAX_FILES} attachment(s)`,
        '',
        'Media URLs and supported variables are preserved in presets. Gallery items support images/videos, alt text and spoilers.',
        'The first gallery item remains mirrored to the legacy image field until the new renderer is enabled.',
      ].join('\n'),
      state,
      who,
    )],
    components: rows.slice(0, 5),
  };
};

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
      const mediaButtonControl = firstRow.components.find((component) => component?.data?.custom_id === 'embed:edit-media');
      if (mediaButtonControl) mediaButtonControl.setLabel('🎨 Appearance');
      if (!firstRow.components.some((component) => component?.data?.custom_id === 'embed:edit-images')) {
        firstRow.addComponents(new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🖼️ Media').setStyle(ButtonStyle.Primary));
      }
    }
    return payload;
  });
  panel.__compactPreviewPatched = true;
}

module.exports = panel;
