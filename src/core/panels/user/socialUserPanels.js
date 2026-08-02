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
      row(
        button('user:module:social', 'My Creator Profile', ButtonStyle.Primary, false, '👤'),
        button('user:social:templates', 'Templates', ButtonStyle.Secondary, false, '🎨'),
      ),
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
    embeds: [base('👥 Creator Profiles', [
      'You do not have a Creator Profile yet.',
      '',
      'Create one to connect your Discord account to Social Studio.',
      '',
      'Ownership is assigned automatically to your Discord account. You cannot select or change the owner.',
    ].join('\n'), interaction)],
    components: [
      row(button('user:social:create', 'New Profile', ButtonStyle.Success, false, '➕')),
      nav(),
    ],
  };
}

function buildProfile(interaction, creator, created = false) {
  const status = creator.status === 'left_server' ? 'Left Server' : creator.status === 'disabled' ? 'Disabled' : 'Active';
  const createdAt = creator.createdAt ? `<t:${Math.floor(new Date(creator.createdAt).getTime() / 1000)}:F>` : 'Unknown';
  const updatedAt = creator.updatedAt ? `<t:${Math.floor(new Date(creator.updatedAt).getTime() / 1000)}:R>` : 'Unknown';

  return {
    embeds: [base('👥 Creator Profiles', [
      created ? '✅ **Creator Profile created.**' : null,
      `**Creator ID**\n\`${creator.creatorId}\``,
      `**Discord Owner**\n<@${creator.ownerDiscordId}>`,
      `**Status**\n${status}`,
      `**Created**\n${createdAt}`,
      `**Last Updated**\n${updatedAt}`,
      '',
      'Use the buttons below to manage your own Creator Profile.',
    ].filter(Boolean).join('\n\n'), interaction)],
    components: [
      row(
        button('user:social:accounts', 'Accounts', ButtonStyle.Secondary, false, '🔗'),
        button('user:social:details', 'Manage Profile', ButtonStyle.Primary, false, '🖊️'),
        button('user:social:create', 'New Profile', ButtonStyle.Success, true, '➕'),
        button('user:social:alerts', 'Post LIVE', ButtonStyle.Primary, false, '📣'),
      ),
      nav(),
    ],
  };
}

function buildSection(interaction, creator, section) {
  const sections = {
    details: {
      title: '🖊️ Manage Profile',
      description: [
        `**Creator ID**\n\`${creator.creatorId}\``,
        `**Discord Owner**\n<@${creator.ownerDiscordId}>`,
        `**Status**\n${creator.status || 'active'}`,
        '',
        'Creator profile management will be connected here using the existing Social Studio profile functions.',
      ].join('\n\n'),
    },
    accounts: {
      title: '🔗 Accounts',
      description: 'Connect and manage the streaming and social accounts owned by your Creator Profile. This section will reuse the existing Social Studio account storage and validation.',
    },
    alerts: {
      title: '📣 Post LIVE',
      description: 'Create and send a LIVE post for an account connected to your Creator Profile. Existing Social Studio posting and alert logic remains the source of truth.',
    },
    templates: {
      title: '🎨 Templates',
      description: 'View and manage the templates available to your Creator Profile. Global template administration remains in the Admin Panel.',
    },
  };

  const selected = sections[section] || sections.details;
  const backId = section === 'templates' ? 'user:category:social' : 'user:social:open';
  return {
    embeds: [base(selected.title, selected.description, interaction, '#FEE75C')],
    components: [nav(backId)],
  };
}

module.exports = {
  buildLanding,
  buildDenied,
  buildCreate,
  buildProfile,
  buildSection,
};
