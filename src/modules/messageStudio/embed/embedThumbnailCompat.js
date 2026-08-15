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
const panel = require('./embedPanel');
const mediaModel = require('./embedMediaModel');

const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}

function resolveSource(source, interaction) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  try {
    const resolved = typeof panel.replaceVars === 'function' ? panel.replaceVars(raw, interaction) : raw;
    const url = new URL(String(resolved || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

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
  const media = mediaModel.mediaForPanel(state);
  const thumbnail = media.thumbnail || { source: '', alt: '' };
  const source = resolveSource(thumbnail.source, interaction);
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

module.exports = panel;
