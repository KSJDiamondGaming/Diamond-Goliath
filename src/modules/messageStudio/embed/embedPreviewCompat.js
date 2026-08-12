'use strict';

// Keep the Embed Studio editor compact by showing only the selected content
// panel while editing. Deployed/test/update payloads still use the real panel
// builders and the deployment media-normalization path.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedPanel');
const { persistPresetMedia } = require('./embedAssetStore');
const mediaModel = require('./embedMediaModel');

function queuePersistentMediaImport(presetLike) {
  persistPresetMedia('global', presetLike).then((results) => {
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      console.warn('[EmbedAssets] persistence import failed:', failed.map((result) => ({
        url: String(result.url).slice(0, 120),
        error: result.error,
      })));
    }
  }).catch((error) => {
    console.warn('[EmbedAssets] persistence import failed:', error?.message || error);
  });
}

function textInput(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(false)
    .setMaxLength(maxLength)
    .setValue(String(value || '').slice(0, maxLength));
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
    new ActionRowBuilder().addComponents(textInput('image', 'Large banner/image URL', TextInputStyle.Short, state.image)),
  );

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
    if (['image', 'thumbnail', 'authorIcon', 'footerIcon'].some((key) => patch && patch[key])) {
      queuePersistentMediaImport({ panels: [patch], mediaV2: result.mediaV2 });
    }
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
      if (!firstRow.components.some((component) => component?.data?.custom_id === 'embed:edit-images')) {
        firstRow.addComponents(new ButtonBuilder().setCustomId('embed:edit-images').setLabel('🖼️ Images').setStyle(ButtonStyle.Primary));
      }
    }
    return payload;
  });

  panel.__compactPreviewPatched = true;
}

module.exports = panel;
