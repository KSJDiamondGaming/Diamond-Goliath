'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
} = require('discord.js');
const mediaModel = require('./embedMediaModel');

const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;

function clone(value, fallback = null) {
  try { return JSON.parse(JSON.stringify(value ?? fallback)); } catch { return fallback; }
}

function getPanelMedia(stateValue, index = null) {
  return mediaModel.mediaForPanel(stateValue, index);
}

function setPanelMedia(stateValue, index, media) {
  return mediaModel.setPanelMedia(stateValue, index, media);
}

function normalizeThumbnail(value) {
  return mediaModel.normalizeThumbnail(value);
}

function ensureStateMedia(stateValue) {
  return mediaModel.ensureStateMedia(stateValue);
}

function reconcileMediaByPanels(previousState, nextState) {
  return mediaModel.reconcileMediaByPanels(previousState, nextState);
}

function syncLegacyPatch(stateValue, patch = {}) {
  return mediaModel.syncLegacyPatch(stateValue, patch);
}

function normalizeStoredMediaState(stateValue) {
  if (!stateValue || typeof stateValue !== 'object') return stateValue;
  const source = stateValue.media || stateValue.mediaV2 || null;
  if (!source) return stateValue;
  return { ...stateValue, media: clone(source), mediaV2: clone(source) };
}

function installStorageNormalization(panel) {
  if (!panel || panel.__mediaStorageNormalized) return panel;

  if (typeof panel.getSession === 'function') {
    const originalGetSession = panel.getSession.bind(panel);
    panel.getSession = (interaction) => normalizeStoredMediaState(originalGetSession(interaction));
  }

  if (typeof panel.saveSession === 'function') {
    const originalSaveSession = panel.saveSession.bind(panel);
    panel.saveSession = (interaction, stateValue) => originalSaveSession(interaction, normalizeStoredMediaState(stateValue));
  }

  if (typeof panel.presetData === 'function') {
    const originalPresetData = panel.presetData.bind(panel);
    panel.presetData = (stateValue) => {
      const normalized = normalizeStoredMediaState(stateValue);
      const preset = originalPresetData(normalized) || {};
      const storedMedia = clone(preset.media || preset.mediaV2 || normalized?.media || normalized?.mediaV2, null);
      const output = { ...preset };
      delete output.mediaV2;
      if (storedMedia) output.media = storedMedia;
      return output;
    };
  }

  if (typeof panel.applyPreset === 'function') {
    const originalApplyPreset = panel.applyPreset.bind(panel);
    panel.applyPreset = (interaction, name, preset = {}) => {
      const source = preset?.media || preset?.mediaV2 || null;
      const compatiblePreset = source ? { ...preset, mediaV2: clone(source) } : preset;
      const result = originalApplyPreset(interaction, name, compatiblePreset);
      return normalizeStoredMediaState(source ? { ...result, media: clone(source) } : result);
    };
  }

  panel.__mediaStorageNormalized = true;
  return panel;
}

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}

function resolveSource(panel, source, interaction) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  try {
    const resolved = typeof panel.replaceVars === 'function' ? panel.replaceVars(raw, interaction) : raw;
    const url = new URL(String(resolved || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function installThumbnailUi(panel) {
  if (!panel || panel.__thumbnailMediaUiBound) return panel;

  panel.thumbnailUploadModal = () => new ModalBuilder()
    .setCustomId('embed:thumbnail-upload-save')
    .setTitle('Upload Thumbnail')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Thumbnail image')
        .setDescription('Upload one image. GIF and other Discord-supported image formats are preserved.')
        .setFileUploadComponent(
          new FileUploadBuilder().setCustomId('thumbnail_file').setMinValues(1).setMaxValues(1).setRequired(true),
        ),
    );

  panel.buildThumbnailOptionsPanel = (interaction) => {
    const state = panel.getSession(interaction);
    const media = getPanelMedia(state);
    const thumbnail = media.thumbnail || { source: '', alt: '' };
    const source = resolveSource(panel, thumbnail.source, interaction);
    const lines = [
      '**Thumbnail settings**',
      `**Source:** ${thumbnail.source ? String(thumbnail.source).slice(0, 500) : 'Not set'}`,
      `**Alt text:** ${thumbnail.alt ? String(thumbnail.alt).slice(0, 700) : 'Not set'}`,
      '',
      'You can use a direct HTTPS image URL, an Embed Studio variable, or upload the thumbnail directly.',
    ];
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🖼️ Thumbnail')
      .setDescription(lines.join('\n'));
    if (source) embed.setThumbnail(source);

    return {
      embeds: [embed],
      components: enforceLimits([
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('embed:thumbnail-edit').setLabel('✏️ Edit URL / Alt').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('embed:thumbnail-upload').setLabel('📤 Upload Thumbnail').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('embed:thumbnail-clear').setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger).setDisabled(!thumbnail.source),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('embed:thumbnail-back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
        ),
      ]),
    };
  };

  panel.__thumbnailMediaUiBound = true;
  return panel;
}

module.exports = {
  ...mediaModel,
  mediaModel,
  clone,
  getPanelMedia,
  setPanelMedia,
  normalizeThumbnail,
  ensureStateMedia,
  reconcileMediaByPanels,
  syncLegacyPatch,
  normalizeStoredMediaState,
  installStorageNormalization,
  installThumbnailUi,
};
