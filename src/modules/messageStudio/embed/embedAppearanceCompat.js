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
const panel = require('./embedThumbnailCompat');

const MAX_COMPONENTS_PER_ROW = panel.EMBED_COMPONENT_LIMITS?.maxComponentsPerRow || 5;
const MAX_ACTION_ROWS = panel.EMBED_COMPONENT_LIMITS?.maxActionRows || 5;

function enforceLimits(rows = []) {
  return rows.filter(Boolean).slice(0, MAX_ACTION_ROWS).map((row) => {
    if (!Array.isArray(row?.components) || row.components.length <= MAX_COMPONENTS_PER_ROW) return row;
    row.components = row.components.slice(0, MAX_COMPONENTS_PER_ROW);
    return row;
  });
}
function input(id, label, value = '', maxLength = 4000) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(maxLength)
    .setValue(String(value || '').slice(0, maxLength));
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
function short(value, max = 500) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

panel.appearanceDetailsModal = (state) => new ModalBuilder()
  .setCustomId(`embed:appearance-details-save:${Date.now()}`)
  .setTitle('Edit Appearance Details')
  .addComponents(
    new ActionRowBuilder().addComponents(input('authorName', 'Author name', state.authorName, 256)),
    new ActionRowBuilder().addComponents(input('authorUrl', 'Author clickable URL', state.authorUrl, 4000)),
    new ActionRowBuilder().addComponents(input('footer', 'Footer text', state.footer, 2048)),
  );

panel.appearanceIconUrlModal = (kind, state) => {
  const isAuthor = kind === 'author';
  const value = isAuthor ? state.authorIcon : state.footerIcon;
  return new ModalBuilder()
    .setCustomId(`embed:appearance-icon-url-save:${kind}:${Date.now()}`)
    .setTitle(isAuthor ? 'Author Icon URL' : 'Footer Icon URL')
    .addComponents(new ActionRowBuilder().addComponents(
      input('source', `${isAuthor ? 'Author' : 'Footer'} icon URL / variable`, value, 4000),
    ));
};

panel.appearanceIconUploadModal = (kind) => {
  const isAuthor = kind === 'author';
  return new ModalBuilder()
    .setCustomId(`embed:appearance-icon-upload-save:${kind}`)
    .setTitle(isAuthor ? 'Upload Author Icon' : 'Upload Footer Icon')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(isAuthor ? 'Author icon image' : 'Footer icon image')
        .setDescription('Upload one image. Discord-supported image formats are preserved.')
        .setFileUploadComponent(new FileUploadBuilder().setCustomId('icon_file').setMinValues(1).setMaxValues(1).setRequired(true)),
    );
};

panel.buildAppearancePanel = (interaction) => {
  const state = panel.getSession(interaction);
  const authorIcon = resolveSource(state.authorIcon, interaction);
  const footerIcon = resolveSource(state.footerIcon, interaction);
  const lines = [
    `**Author name:** ${state.authorName ? short(state.authorName, 300) : 'Not set'}`,
    `**Author link:** ${state.authorUrl ? short(state.authorUrl, 500) : 'Not set'}`,
    `**Author icon:** ${state.authorIcon ? short(state.authorIcon, 500) : 'Not set'}`,
    '',
    `**Footer text:** ${state.footer ? short(state.footer, 700) : 'Not set'}`,
    `**Footer icon:** ${state.footerIcon ? short(state.footerIcon, 500) : 'Not set'}`,
    '',
    'Icon sources can use direct HTTPS image links, Embed Studio variables, or direct uploads.',
  ];
  const embeds = [new EmbedBuilder().setColor(0x5865F2).setTitle('🎨 Appearance').setDescription(lines.join('\n').slice(0, 4096))];
  if (authorIcon) embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Author Icon Preview').setThumbnail(authorIcon));
  if (footerIcon) embeds.push(new EmbedBuilder().setColor(0x5865F2).setTitle('🏷️ Footer Icon Preview').setThumbnail(footerIcon));
  return {
    embeds,
    components: enforceLimits([
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embed:appearance-details').setLabel('✏️ Edit Details').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('embed:appearance-author-icon').setLabel('👤 Author Icon').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('embed:appearance-footer-icon').setLabel('🏷️ Footer Icon').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embed:builder').setLabel('⬅️ Builder').setStyle(ButtonStyle.Secondary),
      ),
    ]),
  };
};

panel.buildAppearanceIconPanel = (interaction, kind) => {
  const state = panel.getSession(interaction);
  const isAuthor = kind === 'author';
  const raw = isAuthor ? state.authorIcon : state.footerIcon;
  const resolved = resolveSource(raw, interaction);
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(isAuthor ? '👤 Author Icon' : '🏷️ Footer Icon')
    .setDescription([
      `**Source:** ${raw ? short(raw, 1000) : 'Not set'}`,
      '',
      'Use a direct HTTPS image URL, an Embed Studio variable, or upload an image directly.',
    ].join('\n'));
  if (resolved) embed.setThumbnail(resolved);
  return {
    embeds: [embed],
    components: enforceLimits([
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`embed:appearance-icon-url:${kind}`).setLabel('✏️ Edit URL').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`embed:appearance-icon-upload:${kind}`).setLabel('📤 Upload').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`embed:appearance-icon-clear:${kind}`).setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger).setDisabled(!raw),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('embed:appearance-back').setLabel('⬅️ Appearance').setStyle(ButtonStyle.Secondary),
      ),
    ]),
  };
};

module.exports = panel;
