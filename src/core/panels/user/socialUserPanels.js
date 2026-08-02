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

function nav(backId = 'user:category:social') {
  return row(
    button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'),
    button('user:home', 'User Panel', ButtonStyle.Secondary, false, '🏠'),
  );
}

function buildLanding(interaction) {
  return {
    embeds: [base('📣 Social Studio', [
      'Create and manage your own Social Studio creator profile.',
      '',
      'Your profile connects your Discord account to your streaming accounts, live alerts and creator settings.',
    ].join('\n'), interaction)],
    components: [
      row(button('user:module:social', 'My Creator Profile', ButtonStyle.Success, false, '👤')),
      nav('user:home'),
    ],
  };
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
      'Use the buttons below to manage the creator features connected to your own profile.',
    ].filter(Boolean).join('\n\n'), interaction)],
    components: [
      row(
        button('user:social:details', 'Creator Details', ButtonStyle.Primary, false, '👤'),
        button('user:social:accounts', 'Linked Accounts', ButtonStyle.Secondary, false, '🌐'),
        button('user:social:alerts', 'Live Alerts', ButtonStyle.Secondary, false, '🔴'),
      ),
      row(
        button('user:social:templates', 'Alert Templates', ButtonStyle.Secondary, false, '🎨'),
        button('user:social:notifications', 'Notifications', ButtonStyle.Secondary, false, '🔔'),
        button('user:social:open', 'Refresh', ButtonStyle.Success, false, '🔄'),
      ),
      nav(),
    ],
  };
}

function buildSection(interaction, creator, section) {
  const sections = {
    details: {
      title: '👤 Creator Details',
      description: [
        `**Creator ID**\n\`${creator.creatorId}\``,
        `**Discord Owner**\n<@${creator.ownerDiscordId}>`,
        `**Status**\n${creator.status || 'active'}`,
        '',
        'Creator name, bio and branding controls will be connected here as we test the shared Creator Profile functions.',
      ].join('\n\n'),
    },
    accounts: {
      title: '🌐 Linked Accounts',
      description: 'Connect and manage the streaming and social accounts owned by this Creator Profile. This section will reuse the existing Social Studio account storage and validation.',
    },
    alerts: {
      title: '🔴 Live Alerts',
      description: 'Manage the live-alert behaviour for accounts linked to this Creator Profile. Alert processing remains owned by the existing Social Studio monitoring and notification systems.',
    },
    templates: {
      title: '🎨 Alert Templates',
      description: 'Choose and manage the alert templates available to this Creator Profile. Global template administration remains in the Admin Panel.',
    },
    notifications: {
      title: '🔔 Creator Notifications',
      description: 'Manage notification preferences for this Creator Profile. Server-wide notification configuration remains in the Admin Panel.',
    },
  };

  const selected = sections[section] || sections.details;
  return {
    embeds: [base(selected.title, selected.description, interaction, '#FEE75C')],
    components: [nav('user:social:open')],
  };
}

module.exports = {
  buildLanding,
  buildDenied,
  buildCreate,
  buildProfile,
  buildSection,
};
