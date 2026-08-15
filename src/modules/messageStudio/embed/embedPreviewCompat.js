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
const state = require('./embedState');
const mediaModel = require('./embedMediaModel');
const mediaCore = require('./embedMedia');

if (!panel.__embedStatePatched) {
  state.bindPanel(panel, {
    defaultState: panel.defaultState,
    sync: panel.sync,
    basePanel: panel.basePanel,
  });
  panel.__embedStatePatched = true;
}

mediaCore.installStateCompatibility(panel);
mediaCore.installPersistentMediaCompatibility(panel);

function textInput(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));
}

function mediaButton(id, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

panel.contentModal = (stateValue) => new ModalBuilder()
  .setCustomId(`embed:save-content-clean:${Date.now()}`)
  .setTitle('Edit Panel Text')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('title', 'Panel title', TextInputStyle.Short, stateValue.title, 256)),
    new ActionRowBuilder().addComponents(textInput('description', 'Panel message/content', TextInputStyle.Paragraph, stateValue.description, 4000)),
  );

panel.mediaModal = (stateValue) => new ModalBuilder()
  .setCustomId(`embed:save-appearance:${Date.now()}`)
  .setTitle('Media & Appearance')
  .addComponents(
    new ActionRowBuilder().addComponents(textInput('authorName', 'Author name', TextInputStyle.Short, stateValue.authorName, 256)),
    new ActionRowBuilder().addComponents(textInput('authorIcon', 'Author logo URL / variable', TextInputStyle.Short, stateValue.authorIcon)),
    new ActionRowBuilder().addComponents(textInput('authorUrl', 'Author clickable URL', TextInputStyle.Short, stateValue.authorUrl)),
    new ActionRowBuilder().addComponents(textInput('footer', 'Footer text', TextInputStyle.Short, stateValue.footer, 2048)),
    new ActionRowBuilder().addComponents(textInput('footerIcon', 'Footer icon URL / variable', TextInputStyle.Short, stateValue.footerIcon)),
  );

panel.thumbnailModal = (stateValue) => {
  const media = mediaModel.mediaForPanel(stateValue);
  return new ModalBuilder().setCustomId(`embed:media-thumbnail-save:${Date.now()}`).setTitle('Thumbnail').addComponents(
    new ActionRowBuilder().addComponents(textInput('source', 'Image URL / variable', TextInputStyle.Short, media.thumbnail?.source || stateValue.thumbnail)),
    new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, media.thumbnail?.alt || '', 1024)),
  );
};

panel.galleryItemModal = (stateValue, index = null) => {
  const media = mediaModel.mediaForPanel(stateValue);
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

panel.fileItemModal = (stateValue, index = null) => {
  const media = mediaModel.mediaForPanel(stateValue);
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
  const currentState = panel.getSession(interaction);
  const media = mediaModel.mediaForPanel(currentState);
  const galleryIndex = Number.isInteger(currentState.selectedMediaIndex) && currentState.selectedMediaIndex < media.gallery.length ? currentState.selectedMediaIndex : null;
  const fileIndex = Number.isInteger(currentState.selectedFileIndex) && currentState.selectedFileIndex < media.files.length ? currentState.selectedFileIndex : null;
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
        `Editing panel **${currentState.selectedPanelIndex + 1}/${currentState.panels.length}**.`,
        '',
        `**Thumbnail:** ${media.thumbnail?.source ? '✅ Configured' : '— None'}`,
        `**Gallery:** ${media.gallery.length}/${mediaModel.MAX_GALLERY_ITEMS} item(s)`,
        `**Files:** ${media.files.length}/${mediaModel.MAX_FILES} attachment(s)`,
        '',
        'Media URLs and supported variables are preserved in presets. Gallery items support images/videos, alt text and spoilers.',
        'The first gallery item remains mirrored to the legacy image field until the new renderer is enabled.',
      ].join('\n'),
      currentState,
      who,
    )],
    components: rows.slice(0, 5),
  };
};

if (!panel.__compactPreviewPatched) {
  function compactPreviewPayload(builder) {
    if (typeof builder !== 'function') return builder;
    return function compactPreviewBuilder(interaction, ...args) {
      const payload = builder(interaction, ...args);
      if (!payload || !Array.isArray(payload.embeds) || payload.embeds.length <= 2) return payload;
      const currentState = typeof panel.getSession === 'function' ? panel.getSession(interaction) : null;
      const selectedIndex = Math.max(0, Number(currentState?.selectedPanelIndex) || 0);
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
