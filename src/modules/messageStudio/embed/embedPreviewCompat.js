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
function mediaSessionKey(interaction) { return `${interaction.guildId}:${interaction.user?.id || 'unknown'}`; }
const mediaSessions = new Map();
function getMediaSession(interaction, state) {
  const media = mediaModel.mediaForPanel(state);
  const current = mediaSessions.get(mediaSessionKey(interaction)) || { selected: 0 };
  current.selected = Math.max(0, Math.min(Number(current.selected) || 0, Math.max(0, media.gallery.length - 1)));
  mediaSessions.set(mediaSessionKey(interaction), current);
  return current;
}
function setMediaSession(interaction, patch) {
  const next = { ...(mediaSessions.get(mediaSessionKey(interaction)) || { selected: 0 }), ...patch };
  mediaSessions.set(mediaSessionKey(interaction), next);
  return next;
}
function shortSource(value) {
  const source = String(value || '');
  return source.length > 72 ? `${source.slice(0, 69)}...` : source || 'Not set';
}
function galleryLabel(item, index) {
  const type = item?.type === 'video' ? 'Video' : item?.type === 'image' ? 'Image' : 'Media';
  return `${index + 1}. ${type}${item?.spoiler ? ' • spoiler' : ''}`.slice(0, 100);
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
panel.mediaItemModal = (item = {}, mode = 'add') => new ModalBuilder()
  .setCustomId(`embed:media-item-save:${mode}:${Date.now()}`)
  .setTitle(mode === 'edit' ? 'Edit Gallery Media' : 'Add Gallery Media')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('source', 'Media URL / variable', TextInputStyle.Short, item.source || '')),
    new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, item.alt || '', 1024)),
    new ActionRowBuilder().addComponents(textInput('type', 'Type: auto, image or video', TextInputStyle.Short, item.type || 'auto', 10)),
    new ActionRowBuilder().addComponents(textInput('spoiler', 'Spoiler? yes / no', TextInputStyle.Short, item.spoiler ? 'yes' : 'no', 5)),
  );
panel.thumbnailModal = (thumbnail = {}) => new ModalBuilder()
  .setCustomId(`embed:media-thumbnail-save:${Date.now()}`)
  .setTitle('Edit Thumbnail')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('source', 'Thumbnail URL / variable', TextInputStyle.Short, thumbnail.source || '')),
    new ActionRowBuilder().addComponents(textInput('alt', 'Thumbnail alt text', TextInputStyle.Paragraph, thumbnail.alt || '', 1024)),
  );

panel.buildMediaManager = (interaction) => {
  const state = panel.getSession(interaction);
  const media = mediaModel.mediaForPanel(state);
  const session = getMediaSession(interaction, state);
  const selected = media.gallery[session.selected] || null;
  const lines = [
    `**Panel:** ${Math.max(1, (Number(state.selectedPanelIndex) || 0) + 1)} / ${state.panels?.length || 1}`,
    `**Thumbnail:** ${media.thumbnail?.source ? shortSource(media.thumbnail.source) : 'Not set'}`,
    `**Gallery:** ${media.gallery.length}/${mediaModel.MAX_GALLERY_ITEMS}`,
    `**Files:** ${media.files.length}/${mediaModel.MAX_FILES} *(file manager coming next)*`,
    '',
    selected ? `**Selected media ${session.selected + 1}:**\n${shortSource(selected.source)}\nType: ${selected.type || 'auto'} • Spoiler: ${selected.spoiler ? 'Yes' : 'No'}${selected.alt ? `\nAlt: ${selected.alt.slice(0, 300)}` : ''}` : '**Selected media:** None',
    '',
    'Gallery items support URL/variable sources, alt text, image/video hints and spoiler state. Existing single-image panels remain compatible.',
  ];
  const components = [];
  if (media.gallery.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('embed:media-select').setPlaceholder('Select gallery media').setMinValues(1).setMaxValues(1)
        .addOptions(media.gallery.map((item, index) => ({ label: galleryLabel(item, index), value: String(index), description: shortSource(item.source).slice(0, 100), default: index === session.selected }))),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:media-add').setLabel('➕ Add Media').setStyle(ButtonStyle.Primary).setDisabled(media.gallery.length >= mediaModel.MAX_GALLERY_ITEMS),
    new ButtonBuilder().setCustomId('embed:media-edit').setLabel('✏️ Edit').setStyle(ButtonStyle.Secondary).setDisabled(!selected),
    new ButtonBuilder().setCustomId('embed:media-remove').setLabel('🗑️ Remove').setStyle(ButtonStyle.Danger).setDisabled(!selected),
    new ButtonBuilder().setCustomId('embed:media-thumbnail').setLabel('🖼️ Thumbnail').setStyle(ButtonStyle.Secondary),
  ));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('embed:media-up').setLabel('⬆️ Up').setStyle(ButtonStyle.Secondary).setDisabled(!selected || session.selected <= 0),
    new ButtonBuilder().setCustomId('embed:media-down').setLabel('⬇️ Down').setStyle(ButtonStyle.Secondary).setDisabled(!selected || session.selected >= media.gallery.length - 1),
    new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('embed:media-refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Media Manager').setDescription(lines.join('\n')).setFooter({ text: `Requested by ${panel.memberName(interaction)}` }).setTimestamp()], components };
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
  panel.getMediaSession = getMediaSession;
  panel.setMediaSession = setMediaSession;
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
