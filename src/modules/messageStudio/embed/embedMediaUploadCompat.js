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
const panel = require('./embedMediaStorageCompat');
const { validatePanelMedia, statusIcon } = require('./embedMediaValidation');

const MAX_COMPONENTS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;

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
function resolvePreviewSource(source, interaction) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  try {
    const resolved = typeof panel.replaceVars === 'function' ? panel.replaceVars(raw, interaction) : raw;
    const url = new URL(String(resolved || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
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
function visualPreview(interaction) {
  const state = panel.getSession(interaction);
  const media = panel.getPanelMedia(state);
  const selected = Number.isInteger(state.selectedMediaIndex) ? media.gallery?.[state.selectedMediaIndex] : null;
  const selectedSource = resolvePreviewSource(selected?.source, interaction);
  const thumbnailSource = resolvePreviewSource(media.thumbnail?.source, interaction);
  const selectedType = String(selected?.type || 'auto').toLowerCase();

  if (selected && selectedType === 'video') {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🎬 Selected Video Preview');
    if (selectedSource) embed.setDescription(`[Open selected video](${selectedSource})${selected.alt ? `\n\n${String(selected.alt).slice(0, 800)}` : ''}`);
    else embed.setDescription('The selected video uses a variable or source that cannot be previewed here yet. It will be resolved when the message is sent.');
    return embed;
  }

  if (selectedSource) {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Selected Media Preview').setImage(selectedSource);
    if (selected?.alt) embed.setDescription(String(selected.alt).slice(0, 800));
    return embed;
  }
  if (thumbnailSource) return new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Thumbnail Preview').setImage(thumbnailSource);
  return null;
}

if (!panel.__mediaUploadButtonPatched && typeof panel.buildMediaManagerPanel === 'function') {
  const original = panel.buildMediaManagerPanel.bind(panel);
  panel.buildMediaManagerPanel = (interaction, requestedBy = null) => {
    const payload = original(interaction, requestedBy);
    const rows = Array.isArray(payload?.components) ? [...payload.components] : [];
    const hasUpload = rows.some((row) => row?.components?.some((component) => component?.data?.custom_id === 'embed:media-upload'));

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
    const preview = visualPreview(interaction);
    const embeds = Array.isArray(payload?.embeds) ? [...payload.embeds] : [];
    if (preview && embeds.length < 10) embeds.push(preview);

    return { ...payload, embeds, components: enforceComponentLimits(rows) };
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
