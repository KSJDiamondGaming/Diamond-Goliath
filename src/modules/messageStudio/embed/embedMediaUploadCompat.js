'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedMediaStorageCompat');
const { validatePanelMedia, statusIcon } = require('./embedMediaValidation');

const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;

function textInput(id, label, style, value = '', maxLength = 4000) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(false)
    .setMaxLength(maxLength)
    .setValue(String(value || '').slice(0, maxLength));
}

panel.mediaUploadModal = () => new ModalBuilder()
  .setCustomId('embed:media-upload-save')
  .setTitle('Upload Media')
  .addLabelComponents(
    new LabelBuilder()
      .setLabel('Upload media or files')
      .setDescription('Add up to 10 files. Images and videos go to the gallery; other files are attached.')
      .setFileUploadComponent(
        new FileUploadBuilder().setCustomId('media_files').setMinValues(1).setMaxValues(10).setRequired(true),
      ),
  );

panel.galleryItemModal = (state, index = null) => {
  const media = panel.getPanelMedia(state);
  const item = Number.isInteger(index) ? (media.gallery[index] || {}) : {};
  const customId = Number.isInteger(index) ? `embed:media-gallery-save:${index}` : 'embed:media-gallery-save-new';
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(Number.isInteger(index) ? 'Edit Gallery Media' : 'Add Gallery Media')
    .addComponents(
      new ActionRowBuilder().addComponents(textInput('source', 'Media URL / variable', TextInputStyle.Short, item.source || '')),
      new ActionRowBuilder().addComponents(textInput('alt', 'Alt text / description', TextInputStyle.Paragraph, item.alt || '', 1024)),
    );
};

function componentCount(row) {
  return Array.isArray(row?.components) ? row.components.length : 0;
}

function enforceComponentLimits(rows = []) {
  return rows
    .filter(Boolean)
    .slice(0, MAX_ACTION_ROWS)
    .map((row) => {
      if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
      row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
      return row;
    });
}

function validationSummary(interaction) {
  const state = panel.getSession(interaction);
  const media = panel.getPanelMedia(state);
  const report = validatePanelMedia(media);
  const lines = ['**Media status**'];
  if (media.thumbnail?.source) lines.push(`${statusIcon(report.thumbnail.status)} Thumbnail — ${report.thumbnail.message}`);
  for (const entry of report.gallery) lines.push(`${statusIcon(entry.status)} Gallery ${entry.index + 1} — ${entry.kind === 'auto' ? 'media' : entry.kind} — ${entry.message}`);
  for (const entry of report.files) lines.push(`${statusIcon(entry.status)} File ${entry.index + 1} — ${entry.kind === 'auto' ? 'file' : entry.kind} — ${entry.message}`);
  if (!media.thumbnail?.source && !report.gallery.length && !report.files.length) lines.push('➖ No media configured yet.');
  lines.push(`Ready: **${report.ready}** • Warnings: **${report.warnings}** • Invalid: **${report.invalid}**`);
  return lines.join('\n').slice(0, 1500);
}

panel.buildMediaOptionsPanel = (interaction) => {
  const state = panel.getSession(interaction);
  const media = panel.getPanelMedia(state);
  const index = Number.isInteger(state.selectedMediaIndex) && media.gallery[state.selectedMediaIndex] ? state.selectedMediaIndex : null;
  const item = index == null ? null : media.gallery[index];
  if (!item) return panel.buildMediaManagerPanel(interaction, panel.memberName(interaction));

  const type = ['auto', 'image', 'video'].includes(item.type) ? item.type : 'auto';
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:media-type:auto').setLabel('✨ Auto Detect').setStyle(type === 'auto' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:media-type:image').setLabel('🖼️ Image').setStyle(type === 'image' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:media-type:video').setLabel('🎬 Video').setStyle(type === 'video' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:media-spoiler:off').setLabel('👁️ Normal').setStyle(item.spoiler ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('embed:media-spoiler:on').setLabel('🙈 Spoiler').setStyle(item.spoiler ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:media-options-back').setLabel('⬅️ Media Manager').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ Media Options')
        .setDescription([
          `**Gallery item:** ${index + 1} / ${media.gallery.length}`,
          `**Type handling:** ${type === 'auto' ? 'Auto detect' : type === 'image' ? 'Image' : 'Video'}`,
          `**Spoiler:** ${item.spoiler ? 'On' : 'Off'}`,
          '',
          'Use the buttons below instead of typing media settings manually. Auto Detect is recommended unless you need to force image or video validation.',
        ].join('\n')),
    ],
    components: enforceComponentLimits(rows),
  };
};

if (!panel.__mediaUploadButtonPatched && typeof panel.buildMediaManagerPanel === 'function') {
  const original = panel.buildMediaManagerPanel.bind(panel);
  panel.buildMediaManagerPanel = (interaction, requestedBy = null) => {
    const payload = original(interaction, requestedBy);
    const rows = Array.isArray(payload?.components) ? [...payload.components] : [];
    const state = panel.getSession(interaction);
    const media = panel.getPanelMedia(state);
    const hasSelectedMedia = Number.isInteger(state.selectedMediaIndex) && Boolean(media.gallery[state.selectedMediaIndex]);
    const hasUpload = rows.some((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-upload'));
    const hasOptions = rows.some((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-options'));

    if (!hasOptions) {
      const targetRow = rows.find((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-gallery-edit'));
      if (targetRow && componentCount(targetRow) < MAX_COMPONENTS_PER_ROW) {
        targetRow.addComponents(
          new ButtonBuilder().setCustomId('embed:media-options').setLabel('⚙️ Options').setStyle(ButtonStyle.Secondary).setDisabled(!hasSelectedMedia),
        );
      }
    }

    if (!hasUpload) {
      const upload = new ButtonBuilder().setCustomId('embed:media-upload').setLabel('📤 Upload Media').setStyle(ButtonStyle.Success);
      const availableRow = [...rows].reverse().find((row) => componentCount(row) < MAX_COMPONENTS_PER_ROW);
      if (availableRow) availableRow.addComponents(upload);
      else if (rows.length < MAX_ACTION_ROWS) rows.push(new ActionRowBuilder().addComponents(upload));
    }

    const embed = payload?.embeds?.[0];
    if (embed?.data) {
      const current = String(embed.data.description || '');
      const status = validationSummary(interaction);
      embed.setDescription(`${current}\n\n${status}`.slice(0, 4096));
    }

    return { ...payload, components: enforceComponentLimits(rows) };
  };
  panel.buildMediaManager = panel.buildMediaManagerPanel;
  panel.__mediaUploadButtonPatched = true;
}

panel.validatePanelMedia = validatePanelMedia;
panel.EMBED_COMPONENT_LIMITS = Object.freeze({
  maxComponentsPerRow: MAX_COMPONENTS_PER_ROW,
  maxActionRows: MAX_ACTION_ROWS,
});

module.exports = panel;
