'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const ACTIVE = 'active';
const LEFT_SERVER = 'left_server';

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const item = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) item.setEmoji(emoji);
  return item;
}

function row(...items) {
  return new ActionRowBuilder().addComponents(...items);
}

function nameOf(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function base(title, description, interaction, color = '#5865F2') {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${nameOf(interaction)}` })
    .setTimestamp();
}

function navigation(backId = 'user:category:social') {
  return row(
    button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'),
    button('user:preferences', 'Settings', ButtonStyle.Secondary, false, '⚙️'),
  );
}

function creatorActionRows(creator = null) {
  const hasCreator = Boolean(creator);
  const completed = creator?.profileCompleted === true;
  return [
    row(
      button('user:social:create', 'New Profile', ButtonStyle.Success, completed, '➕'),
      button('user:social:accounts', 'Accounts', ButtonStyle.Primary, !hasCreator, '🔗'),
      button('user:social:alerts', '📣 Post LIVE', ButtonStyle.Primary, !hasCreator),
    ),
    row(button('user:social:details', 'Manage Profile', ButtonStyle.Primary, !hasCreator, '✏️')),
  ];
}

function creatorModal(creator = null, interaction = null) {
  const suggestedName = creator?.displayName
    || interaction?.member?.displayName
    || interaction?.user?.globalName
    || interaction?.user?.username
    || '';

  return new ModalBuilder()
    .setCustomId('user:social:create:submit')
    .setTitle('Create Creator Profile')
    .addComponents(
      row(new TextInputBuilder()
        .setCustomId('displayName')
        .setLabel('Creator display name')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(120)
        .setRequired(true)
        .setValue(String(suggestedName).slice(0, 120))),
      row(new TextInputBuilder()
        .setCustomId('group')
        .setLabel('Group or team')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(120)
        .setRequired(false)
        .setValue(String(creator?.group || '').slice(0, 120))),
      row(new TextInputBuilder()
        .setCustomId('tags')
        .setLabel('Tags (comma separated)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(300)
        .setRequired(false)
        .setValue(Array.isArray(creator?.tags) ? creator.tags.join(', ').slice(0, 300) : '')),
      row(new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(false)
        .setValue(String(creator?.notes || '').slice(0, 1000))),
    );
}

function accountLabel(account) {
  const platform = String(account?.platform || 'account').trim();
  return platform ? `${platform.charAt(0).toUpperCase()}${platform.slice(1)}` : 'Account';
}

function accountSummary(accounts = []) {
  if (!accounts.length) return '**Linked Accounts**\nNone connected';
  return [
    `**Linked Accounts (${accounts.length})**`,
    ...accounts.map((account) => {
      const name = account.displayName || account.username || account.externalId || account.accountId || 'Unnamed account';
      return `• **${accountLabel(account)}** — ${name} · ${account.enabled === false ? 'Disabled' : 'Enabled'}`;
    }),
  ].join('\n');
}

function buildLanding(interaction) {
  return {
    embeds: [base('📣 Social Studio', [
      'Create and manage your own Social Studio creator profile.',
      '',
      'Your profile connects your Discord account to your streaming accounts, live alerts and creator settings.',
    ].join('\n'), interaction)],
    components: [
      row(button('user:module:social', 'My Creator Profile', ButtonStyle.Primary, false, '👤')),
      navigation('user:home'),
    ],
  };
}

function buildDenied(interaction, roleIds = []) {
  const roleText = roleIds.length
    ? roleIds.map((id) => `<@&${id}>`).join('\n')
    : 'No eligible roles are currently available.';
  return {
    embeds: [base('📣 Social Studio', [
      'You do not currently have access to Social Studio.',
      '',
      '**Required role — one of:**',
      roleText,
      '',
      'The Social Studio button is unavailable until you receive an eligible role.',
    ].join('\n'), interaction, '#FEE75C')],
    components: [
      row(button('user:social:locked', 'Social Studio', ButtonStyle.Secondary, true, '🔒')),
      navigation(),
    ],
  };
}

function buildCreate(interaction) {
  return {
    embeds: [base('👥 Creator Profiles', [
      'You do not have a completed Creator Profile yet.',
      '',
      'Select New Profile to complete the same Creator Profile form used by Social Studio Management.',
      '',
      'Your unique Creator ID and ownership are permanently attached to your Discord user ID.',
    ].join('\n'), interaction)],
    components: [...creatorActionRows(null), navigation()],
  };
}

function buildProfile(interaction, creator, accounts = [], created = false) {
  const status = creator.status === LEFT_SERVER
    ? 'Left Server'
    : creator.status === 'disabled' ? 'Disabled' : 'Active';
  const createdAt = creator.createdAt
    ? `<t:${Math.floor(new Date(creator.createdAt).getTime() / 1000)}:F>`
    : 'Unknown';
  const updatedAt = creator.updatedAt
    ? `<t:${Math.floor(new Date(creator.updatedAt).getTime() / 1000)}:R>`
    : 'Unknown';

  return {
    embeds: [base('👥 My Creator Profile', [
      created ? '✅ **Creator Profile created.**' : null,
      creator.profileCompleted !== true
        ? '⚠️ **Profile setup has not been submitted yet. Select New Profile to complete it.**'
        : null,
      `**Creator ID**\n\`${creator.creatorId}\``,
      creator.displayName ? `**Creator Name**\n${creator.displayName}` : null,
      `**Status**\n${status}`,
      accountSummary(accounts),
      `**Created**\n${createdAt}`,
      `**Last Updated**\n${updatedAt}`,
      '',
      'Use the buttons below to manage your Creator Profile and linked accounts.',
    ].filter(Boolean).join('\n\n'), interaction)],
    components: [...creatorActionRows(creator), navigation()],
  };
}

function buildSection(interaction, creator, section, accounts = []) {
  const sections = {
    details: {
      title: '✏️ Manage Profile',
      description: [
        `**Creator ID**\n\`${creator.creatorId}\``,
        creator.displayName ? `**Creator Name**\n${creator.displayName}` : null,
        `**Status**\n${creator.status || ACTIVE}`,
        '',
        'Creator profile management will be connected here using the existing Social Studio profile functions.',
      ].filter(Boolean).join('\n\n'),
    },
    accounts: {
      title: '🔗 Accounts',
      description: [
        `**Creator ID**\n\`${creator.creatorId}\``,
        accountSummary(accounts),
        '',
        'Only accounts linked to your Creator Profile are shown here.',
      ].join('\n\n'),
    },
    alerts: {
      title: '📣 Post LIVE',
      description: 'Create and send a LIVE post for an account connected to your Creator Profile. Existing Social Studio posting and alert logic remains the source of truth.',
    },
    templates: {
      title: '🎨 Templates',
      description: 'View and manage the templates available to your Creator Profile. Global template administration remains in the Admin Panel.',
    },
    notifications: {
      title: '🔔 Notifications',
      description: 'Manage Social Studio notifications available to your Creator Profile.',
    },
  };

  const selected = sections[section] || sections.details;
  return {
    embeds: [base(selected.title, selected.description, interaction, '#FEE75C')],
    components: [navigation('user:social:open')],
  };
}

module.exports = {
  user: {
    buildLanding,
    buildDenied,
    buildCreate,
    buildProfile,
    buildSection,
    creatorModal,
  },
};
