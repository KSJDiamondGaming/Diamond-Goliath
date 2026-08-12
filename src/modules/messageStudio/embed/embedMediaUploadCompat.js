'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
} = require('discord.js');
const panel = require('./embedPreviewCompat');

panel.mediaUploadModal = () => new ModalBuilder()
  .setCustomId('embed:media-upload-save')
  .setTitle('Upload Media')
  .addLabelComponents(
    new LabelBuilder()
      .setLabel('Upload media or files')
      .setDescription('Add up to 10 files. Images and videos go to the gallery; other files are attached.')
      .setFileUploadComponent(
        new FileUploadBuilder()
          .setCustomId('media_files')
          .setMinValues(1)
          .setMaxValues(10)
          .setRequired(true),
      ),
  );

if (!panel.__mediaUploadButtonPatched && typeof panel.buildMediaManagerPanel === 'function') {
  const original = panel.buildMediaManagerPanel.bind(panel);
  panel.buildMediaManagerPanel = (interaction, requestedBy = null) => {
    const payload = original(interaction, requestedBy);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    const lastRow = rows[rows.length - 1];
    const hasUpload = rows.some((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-upload'));
    if (!hasUpload) {
      const upload = new ButtonBuilder()
        .setCustomId('embed:media-upload')
        .setLabel('📤 Upload Media')
        .setStyle(ButtonStyle.Success);
      if (lastRow?.components?.length < 5) lastRow.addComponents(upload);
      else if (rows.length < 5) rows.push(new ActionRowBuilder().addComponents(upload));
    }
    return { ...payload, components: rows.slice(0, 5) };
  };
  panel.buildMediaManager = panel.buildMediaManagerPanel;
  panel.__mediaUploadButtonPatched = true;
}

module.exports = panel;
