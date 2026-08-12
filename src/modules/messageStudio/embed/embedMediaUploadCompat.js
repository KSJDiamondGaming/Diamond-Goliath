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
const { validatePanelMedia, statusIcon } = require('./embedMediaValidation');

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

if (!panel.__mediaUploadButtonPatched && typeof panel.buildMediaManagerPanel === 'function') {
  const original = panel.buildMediaManagerPanel.bind(panel);
  panel.buildMediaManagerPanel = (interaction, requestedBy = null) => {
    const payload = original(interaction, requestedBy);
    const rows = Array.isArray(payload?.components) ? payload.components : [];
    const lastRow = rows[rows.length - 1];
    const hasUpload = rows.some((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-upload'));
    if (!hasUpload) {
      const upload = new ButtonBuilder().setCustomId('embed:media-upload').setLabel('📤 Upload Media').setStyle(ButtonStyle.Success);
      if (lastRow?.components?.length < 5) lastRow.addComponents(upload);
      else if (rows.length < 5) rows.push(new ActionRowBuilder().addComponents(upload));
    }
    const embed = payload?.embeds?.[0];
    if (embed?.data) {
      const current = String(embed.data.description || '');
      const status = validationSummary(interaction);
      embed.setDescription(`${current}\n\n${status}`.slice(0, 4096));
    }
    return { ...payload, components: rows.slice(0, 5) };
  };
  panel.buildMediaManager = panel.buildMediaManagerPanel;
  panel.__mediaUploadButtonPatched = true;
}

panel.validatePanelMedia = validatePanelMedia;
module.exports = panel;
