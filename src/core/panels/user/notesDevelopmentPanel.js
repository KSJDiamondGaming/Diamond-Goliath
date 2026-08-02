'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function button(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const component = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) component.setEmoji(emoji);
  return component;
}

function buildNotesDevelopmentPanel(interaction) {
  const memberDisplayName = interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';

  const embed = new EmbedBuilder()
    .setColor('#FEE75C')
    .setTitle('📌 Notes — Development Memo')
    .setDescription([
      '**Purpose**',
      'A lightweight personal notebook built into Goliath.',
      '',
      '**Locked direction**',
      '• Personal notebook',
      '• Private — only the owner can view and manage their notes',
      '• Global to the Discord user, not stored separately per guild',
      '',
      '**Planned features**',
      '• Create Note',
      '• Edit Note',
      '• Delete Note',
      '• Pin Note',
      '• Search Notes',
      '',
      '**Possible future ideas**',
      '• Folders',
      '• Categories',
      '• Archive Notes',
      '',
      '**Will not include**',
      '• Public notes',
      '• Shared notes',
      '• Moderator notes',
      '• Attachments',
      '• Rich text formatting',
      '• Collaboration',
      '',
      '**Design goal**',
      'A simple personal notebook that follows the user across every server running Goliath.',
      '',
      '*This is a development reminder only. Notes functionality has not been built yet.*',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      button('user:home', 'Back', ButtonStyle.Secondary, '⬅️'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, '🏠'),
    )],
  };
}

module.exports = { buildNotesDevelopmentPanel };
