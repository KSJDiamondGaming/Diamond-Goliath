'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const item = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) item.setEmoji(emoji);
  return item;
}

function row(...items) {
  return new ActionRowBuilder().addComponents(...items);
}

function nameOf(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function base(title, description, interaction, color = '#5865F2') {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${nameOf(interaction)}` })
    .setTimestamp();
}

function nav() {
  return row(
    button('user:home', 'Back', ButtonStyle.Secondary, false, '⬅️'),
    button('user:home', 'User Panel', ButtonStyle.Secondary, false, '🏠'),
  );
}

function buildDenied(interaction, roleIds = []) {
  const roleText = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join('\n') : 'No eligible roles are currently available.';
  return {
    embeds: [base('📣 Social Studio', [
      'You do not currently have access to Social Studio.',
      '',
      '**Required role — one of:**',
      roleText,
      '',
      'The Social Studio button is unavailable until you receive an eligible role.',
    ].join('\n'), interaction, '#FEE75C')],
    components: [row(button('user:social:locked', 'Social Studio', ButtonStyle.Secondary, true, '🔒')), nav()],
  };
}

function buildCreate(interaction) {
  return {
    embeds: [base('📣 My Creator Profile', [
      'You do not have a Creator Profile yet.',
      '',
      'Create one to connect your Discord account to Social Studio.',
      '',
      'Ownership is assigned automatically to your Discord account. You cannot select or change the owner.',
    ].join('\n'), interaction)],
    components: [
      row(button('user:social:create', 'Create Creator Profile', ButtonStyle.Success, false, '➕')),
      nav(),
    ],
  };
}

function buildProfile(interaction, creator, created = false) {
  const status = creator.status === 'left_server' ? 'Left Server' : creator.status === 'disabled' ? 'Disabled' : 'Active';
  const createdAt = creator.createdAt ? `<t:${Math.floor(new Date(creator.createdAt).getTime() / 1000)}:F>` : 'Unknown';
  const updatedAt = creator.updatedAt ? `<t:${Math.floor(new Date(creator.updatedAt).getTime() / 1000)}:R>` : 'Unknown';
  return {
    embeds: [base('📣 My Creator Profile', [
      created ? '✅ **Creator Profile created.**' : null,
      `**Creator ID**\n\`${creator.creatorId}\``,
      `**Discord Owner**\n<@${creator.ownerDiscordId}>`,
      `**Status**\n${status}`,
      `**Created**\n${createdAt}`,
      `**Last Updated**\n${updatedAt}`,
      '',
      'More Creator Profile sections will be added in later phases.',
    ].filter(Boolean).join('\n\n'), interaction)],
    components: [
      row(button('user:social:open', 'Refresh', ButtonStyle.Success, false, '🔄')),
      nav(),
    ],
  };
}

module.exports = { buildDenied, buildCreate, buildProfile };
