'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const security = require('../../../core/security/securityCore');
const adminPanel = require('./socialStudioPanel');

const ACTIVE = 'active';
const LEFT_SERVER = 'left_server';

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function getSection(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {});
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function saveSection(guildId, section) {
  guildManager.saveGuildSection(guildId, 'social', section, { guildId });
  return section;
}

function getConfiguredRoleIds(guildId) {
  const section = getSection(guildId);
  return Array.isArray(section.userRoleIds)
    ? [...new Set(section.userRoleIds.map(String).filter(Boolean))]
    : [];
}

function getAccess(interaction) {
  const roleIds = getConfiguredRoleIds(interaction.guildId);
  const override = Boolean(
    security.isBotOwner?.(interaction.user?.id)
    || interaction.guild?.ownerId === interaction.user?.id
    || interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator),
  );
  const allowed = override
    || !roleIds.length
    || roleIds.some((id) => interaction.member?.roles?.cache?.has?.(id));
  return { allowed, roleIds, override };
}

function creators(section) {
  if (!section.creators || typeof section.creators !== 'object' || Array.isArray(section.creators)) {
    section.creators = {};
  }
  return section.creators;
}

function findByOwnerDiscordId(guildId, ownerDiscordId) {
  const ownerId = clean(ownerDiscordId, 25);
  if (!ownerId) return null;
  return Object.values(creators(getSection(guildId)))
    .find((creator) => creator?.ownerDiscordId === ownerId) || null;
}

function getAccountsForCreator(guildId, creator) {
  if (!creator) return [];
  const section = getSection(guildId);
  const accounts = section.accounts && typeof section.accounts === 'object' && !Array.isArray(section.accounts)
    ? section.accounts
    : {};
  const accountIds = Array.isArray(creator.accountIds) ? creator.accountIds.map(String) : [];
  return accountIds.map((accountId) => accounts[accountId]).filter(Boolean);
}

function nextCreatorId(section) {
  const used = new Set(Object.keys(creators(section)));
  let sequence = Math.max(0, Number(section.creatorSequence || 0));
  let id;
  do {
    sequence += 1;
    id = `creator_${String(sequence).padStart(6, '0')}`;
  } while (used.has(id));
  section.creatorSequence = sequence;
  return id;
}

function createForMember(member) {
  const guildId = member.guild.id;
  const ownerDiscordId = member.user.id;
  const existing = findByOwnerDiscordId(guildId, ownerDiscordId);
  if (existing) return { creator: existing, created: false };

  const section = getSection(guildId);
  const creatorId = nextCreatorId(section);
  const timestamp = new Date().toISOString();
  const creator = {
    creatorId,
    ownerDiscordId,
    displayName: clean(member.displayName || member.user.globalName || member.user.username, 120),
    group: '',
    tags: [],
    notes: '',
    enabled: true,
    status: ACTIVE,
    accountIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  creators(section)[creatorId] = creator;
  saveSection(guildId, section);
  return { creator, created: true };
}

function markMemberActive(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section))
    .find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = ACTIVE;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function markMemberLeft(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section))
    .find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = LEFT_SERVER;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function deleteCreatorOwnedData(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const entry = Object.entries(creators(section))
    .find(([, item]) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!entry) return false;
  const [creatorId, creator] = entry;
  const accountIds = new Set(Array.isArray(creator.accountIds) ? creator.accountIds : []);
  delete section.creators[creatorId];
  if (section.accounts && typeof section.accounts === 'object') {
    for (const accountId of accountIds) delete section.accounts[accountId];
  }
  for (const key of ['drafts', 'scheduledPosts', 'creatorPreferences', 'notifications']) {
    if (!section[key] || typeof section[key] !== 'object') continue;
    for (const [id, value] of Object.entries(section[key])) {
      if (value?.creatorId === creatorId || value?.ownerDiscordId === String(ownerDiscordId)) {
        delete section[key][id];
      }
    }
  }
  saveSection(guildId, section);
  return true;
}

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const item = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
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

function socialNavigation(backId = 'user:category:social') {
  return row(
    button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'),
    button('user:preferences', 'Settings', ButtonStyle.Secondary, false, '⚙️'),
  );
}

function sectionNavigation(backId = 'user:social:open') {
  return row(
    button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'),
    button('user:preferences', 'Settings', ButtonStyle.Secondary, false, '⚙️'),
  );
}

function creatorActionRows(hasCreator) {
  return [
    row(
      button('user:social:create', 'New Profile', ButtonStyle.Success, hasCreator, '➕'),
      button('user:social:accounts', 'Accounts', ButtonStyle.Primary, !hasCreator, '🔗'),
      button('user:social:alerts', 'Post LIVE', ButtonStyle.Primary, !hasCreator, '📣'),
    ),
    row(button('user:social:details', 'Manage Profile', ButtonStyle.Primary, !hasCreator, '✏️')),
  ];
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

function buildUserLanding(interaction) {
  return {
    embeds: [base('📣 Social Studio', [
      'Create and manage your own Social Studio creator profile.',
      '',
      'Your profile connects your Discord account to your streaming accounts, live alerts and creator settings.',
    ].join('\n'), interaction)],
    components: [
      row(button('user:module:social', 'My Creator Profile', ButtonStyle.Primary, false, '👤')),
      socialNavigation('user:home'),
    ],
  };
}

function buildUserDenied(interaction, roleIds = []) {
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
      socialNavigation(),
    ],
  };
}

function buildUserCreate(interaction) {
  return {
    embeds: [base('👥 Creator Profiles', [
      'You do not have a Creator Profile yet.',
      '',
      'Create one to connect your Discord account to Social Studio.',
      '',
      'Ownership is assigned automatically to your Discord account. You cannot select or change the owner.',
    ].join('\n'), interaction)],
    components: [...creatorActionRows(false), socialNavigation()],
  };
}

function buildUserProfile(interaction, creator, accounts = [], created = false) {
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
      `**Creator ID**\n\`${creator.creatorId}\``,
      creator.displayName ? `**Creator Name**\n${creator.displayName}` : null,
      `**Status**\n${status}`,
      accountSummary(accounts),
      `**Created**\n${createdAt}`,
      `**Last Updated**\n${updatedAt}`,
      '',
      'Use the buttons below to manage your Creator Profile and linked accounts.',
    ].filter(Boolean).join('\n\n'), interaction)],
    components: [...creatorActionRows(true), socialNavigation()],
  };
}

function buildUserSection(interaction, creator, section, accounts = []) {
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
    components: [sectionNavigation()],
  };
}

function getCreatorContext(interaction) {
  const access = getAccess(interaction);
  if (!access.allowed) return { payload: buildUserDenied(interaction, access.roleIds) };
  const creator = findByOwnerDiscordId(interaction.guildId, interaction.user.id);
  if (!creator) return { payload: buildUserCreate(interaction) };
  return { creator, accounts: getAccountsForCreator(interaction.guildId, creator) };
}

async function handleUserInteraction(interaction, updatePanel) {
  const customId = String(interaction?.customId || '');
  const isSocial = customId === 'user:category:social'
    || customId === 'user:module:social'
    || customId === 'user:social:open'
    || customId === 'user:social:create'
    || /^user:social:(details|accounts|alerts|templates|notifications)$/.test(customId);
  if (!isSocial) return false;
  if (customId === 'user:category:social') {
    return updatePanel(interaction, buildUserLanding(interaction));
  }
  if (customId === 'user:social:create') {
    const access = getAccess(interaction);
    if (!access.allowed) return updatePanel(interaction, buildUserDenied(interaction, access.roleIds));
    const result = createForMember(interaction.member);
    const accounts = getAccountsForCreator(interaction.guildId, result.creator);
    return updatePanel(interaction, buildUserProfile(interaction, result.creator, accounts, result.created));
  }
  const context = getCreatorContext(interaction);
  if (context.payload) return updatePanel(interaction, context.payload);
  const match = customId.match(/^user:social:(details|accounts|alerts|templates|notifications)$/);
  return updatePanel(
    interaction,
    match
      ? buildUserSection(interaction, context.creator, match[1], context.accounts)
      : buildUserProfile(interaction, context.creator, context.accounts),
  );
}

const user = {
  buildLanding: buildUserLanding,
  buildDenied: buildUserDenied,
  buildCreate: buildUserCreate,
  buildProfile: buildUserProfile,
  buildSection: buildUserSection,
  handleInteraction: handleUserInteraction,
  canAccess: (interaction) => getAccess(interaction).allowed,
};

module.exports = {
  startup() {},
  shutdown() {},
  admin: adminPanel,
  user,
  ACTIVE,
  LEFT_SERVER,
  getConfiguredRoleIds,
  getAccess,
  findByOwnerDiscordId,
  getAccountsForCreator,
  createForMember,
  markMemberActive,
  markMemberLeft,
  deleteCreatorOwnedData,
};
