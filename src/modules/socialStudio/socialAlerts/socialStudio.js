'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const crypto = require('crypto');
const security = require('../../../core/security/securityCore');
const { normalizeAccountInput, migrateAccount } = require('./accountNormalizer');
const { providerInfo } = require('./socialStudioProviders');
const store = require('./socialStudioStore');
const adminPanel = require('./socialStudioPanel');

const ACTIVE = 'active';
const LEFT_SERVER = 'left_server';
const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'kick', 'facebook', 'instagram', 'x'];
const ALERT_TYPES = ['live', 'ended', 'vod', 'clip', 'upload', 'short', 'post'];
const LABEL = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };
const userAccountSessions = new Map();

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

const getSection = store.getSection;
const getConfiguredRoleIds = store.getUserRoleIds;

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

function findByOwnerDiscordId(guildId, ownerDiscordId) {
  return store.findCreatorByOwner(guildId, clean(ownerDiscordId, 25));
}

function getAccountsForCreator(guildId, creator) {
  return store.getCreatorAccounts(guildId, creator);
}

function createForMember(member) {
  return store.createCreatorForMember(member, { actorId: member.user.id });
}

function completeCreatorProfile(member, values) {
  return store.completeCreatorProfile(member, values, { actorId: member.user.id });
}

function markMemberActive(guildId, ownerDiscordId) {
  return store.markCreatorActive(guildId, ownerDiscordId, { actorId: ownerDiscordId });
}

function markMemberLeft(guildId, ownerDiscordId) {
  return store.markCreatorDeparted(guildId, ownerDiscordId, 'left', {
    actorId: 'system:social-studio-lifecycle',
  });
}

function deleteCreatorOwnedData(guildId, ownerDiscordId) {
  return store.deleteCreatorByOwner(guildId, ownerDiscordId, {
    actorId: 'system:social-studio-delete',
  });
}

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const item = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) item.setEmoji(emoji);
  return item;
}

function row(...items) {
  return new ActionRowBuilder().addComponents(...items);
}

function userCreatorModal(creator = null, interaction = null) {
  const suggestedName = creator?.displayName
    || interaction?.member?.displayName
    || interaction?.user?.globalName
    || interaction?.user?.username
    || '';
  return new ModalBuilder()
    .setCustomId('user:social:create:submit')
    .setTitle('Create Creator Profile')
    .addComponents(
      row(new TextInputBuilder().setCustomId('displayName').setLabel('Creator display name').setPlaceholder('Enter the public creator name here').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true).setValue(String(suggestedName).slice(0, 120))),
      row(new TextInputBuilder().setCustomId('group').setLabel('Group or team').setPlaceholder('Add your team, brand or category here').setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(false).setValue(String(creator?.group || '').slice(0, 120))),
      row(new TextInputBuilder().setCustomId('tags').setLabel('Tags (comma separated)').setPlaceholder('Example: streamer, ksj, twitch').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false).setValue(Array.isArray(creator?.tags) ? creator.tags.join(', ').slice(0, 300) : '')),
      row(new TextInputBuilder().setCustomId('notes').setLabel('Profile Notes (optional)').setPlaceholder('Add notes about this creator profile.').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false).setValue(String(creator?.notes || '').slice(0, 1000))),
    );
}

function nameOf(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function base(title, description, interaction, color = '#5865F2') {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${nameOf(interaction)}` }).setTimestamp();
}

function socialNavigation(backId = 'user:category:social') {
  return row(button(backId, '⬅️ Back', ButtonStyle.Secondary));
}

function sectionNavigation(backId = 'user:social:open') {
  return row(button(backId, '⬅️ Back', ButtonStyle.Secondary));
}

function creatorActionRows(creator = null, accounts = []) {
  const hasCreator = Boolean(creator);
  const completed = creator?.profileCompleted === true;
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
  if (!hasCreator || !completed) return [row(button('user:social:create', '➕ New Profile', ButtonStyle.Success, completed))];
  const rows = [
    row(
      button('user:social:create', '➕ New Profile', ButtonStyle.Success, true),
      button('user:social:newAccount', '➕ New Account', ButtonStyle.Success),
      ...(hasAccounts ? [button('user:social:alerts', '📣 Post LIVE', ButtonStyle.Primary)] : []),
    ),
    row(
      button('user:social:details', '📝 Manage Profile', ButtonStyle.Primary),
      ...(hasAccounts ? [button('user:social:manageAccount', '🛠️ Manage Account', ButtonStyle.Primary)] : []),
    ),
  ];
  return rows;
}

function accountLabel(account) {
  const platform = String(account?.platform || 'account').trim();
  return platform ? `${platform.charAt(0).toUpperCase()}${platform.slice(1)}` : 'Account';
}

function accountSummary(accounts = []) {
  if (!accounts.length) return '**Linked Accounts**\nNone connected';
  return [`**Linked Accounts (${accounts.length})**`, ...accounts.map((account) => {
    const name = account.displayName || account.username || account.externalId || account.accountId || 'Unnamed account';
    return `• **${accountLabel(account)}** — ${name} · ${account.enabled === false ? 'Disabled' : 'Enabled'}`;
  })].join('\n');
}

function userAccountSessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
}

function getUserAccountSession(interaction) {
  return userAccountSessions.get(userAccountSessionKey(interaction)) || { platforms: [] };
}

function setUserAccountSession(interaction, patch) {
  const next = { ...getUserAccountSession(interaction), ...patch };
  userAccountSessions.set(userAccountSessionKey(interaction), next);
  return next;
}

function supportedAlerts(platform) {
  const supported = (providerInfo(platform).supportedAlertTypes || []).filter((type) => ALERT_TYPES.includes(type));
  if (supported.includes('live') && !supported.includes('ended')) supported.splice(1, 0, 'ended');
  return supported;
}

function userPlatformSelect(selected = []) {
  return row(new StringSelectMenuBuilder()
    .setCustomId('user:social:account:platforms')
    .setPlaceholder('Select platform(s) to add an account')
    .setMinValues(1)
    .setMaxValues(5)
    .addOptions(PLATFORMS.map((platform) => ({
      label: LABEL[platform],
      value: platform,
      default: selected.includes(platform),
    }))));
}

function userAccountModal(platforms) {
  const modal = new ModalBuilder().setCustomId('user:social:account:create-multi').setTitle('Add Social Accounts');
  for (const platform of platforms.slice(0, 5)) {
    modal.addComponents(row(new TextInputBuilder()
      .setCustomId(`account_${platform}`)
      .setLabel(`${LABEL[platform]} username, channel ID or URL`)
      .setPlaceholder(`Paste the ${LABEL[platform]} profile URL, username or ID here`)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(500)
      .setRequired(true)));
  }
  return modal;
}

function buildUserAddAccounts(interaction, creator) {
  const selected = getUserAccountSession(interaction).platforms || [];
  const selectedText = selected.length ? selected.map((platform) => LABEL[platform] || platform).join(', ') : 'None';
  return {
    embeds: [base('➕ Add Accounts', [
      `Add one or more social accounts to **${creator.displayName || creator.creatorId}**.`,
      '',
      'Select up to 5 platforms, then continue. The next form will ask for a username, channel ID or URL for each selected platform.',
      '',
      `**Selected:** ${selectedText}`,
    ].join('\n'), interaction)],
    components: [
      userPlatformSelect(selected),
      row(
        button('user:social:open', '⬅️ Back', ButtonStyle.Secondary),
        button('user:social:account:continue', '➡️ Continue', ButtonStyle.Success, !selected.length),
      ),
    ],
  };
}

function canonicalIdentity(account) {
  return String(account.canonicalIdentity || account.externalId || account.normalizedUsername || account.username || '').toLowerCase();
}

function canonicalKey(account) {
  return `${String(account.platform || '').toLowerCase()}:${canonicalIdentity(account)}`;
}

function upsertUserAccount(guildId, creator, platform, rawValue, actorId) {
  const section = getSection(guildId);
  const normalized = normalizeAccountInput(platform, rawValue);
  const key = `${platform}:${String(normalized.canonicalIdentity || normalized.externalId || normalized.normalizedUsername || normalized.username || '').toLowerCase()}`;
  const matches = Object.values(section.accounts || {}).filter((account) => {
    try { return canonicalKey(migrateAccount(account)) === key; } catch { return false; }
  });
  const primary = matches[0] || null;
  const accountId = primary?.accountId || `account_${crypto.randomBytes(8).toString('hex')}`;
  const duplicateAccountIds = matches.slice(1).map((account) => account.accountId);
  const account = {
    ...(primary || {}),
    accountId,
    platform,
    username: normalized.username,
    normalizedUsername: normalized.normalizedUsername,
    externalId: primary?.externalId || normalized.externalId || null,
    inputType: normalized.inputType,
    canonicalIdentity: normalized.canonicalIdentity,
    profileUrl: normalized.profileUrl,
    sourceInput: normalized.sourceInput,
    displayName: creator.displayName,
    enabled: primary?.enabled !== false,
    alertTypes: Array.isArray(primary?.alertTypes) ? primary.alertTypes : supportedAlerts(platform),
    alertChannelId: primary?.alertChannelId || null,
    alertChannels: primary?.alertChannels && typeof primary.alertChannels === 'object' ? primary.alertChannels : {},
    mentionMode: primary?.mentionMode || section.notificationMentionMode || 'none',
    mentionRoleId: primary?.mentionRoleId || (section.notificationMentionMode === 'role' ? section.notificationRoleId || null : null),
    createdAt: primary?.createdAt || new Date().toISOString(),
  };

  return store.upsertCreatorAccount(
    guildId,
    creator.creatorId,
    account,
    duplicateAccountIds,
    { actorId },
  );
}

function buildUserLanding(interaction) {
  return { embeds: [base('📣 Social Studio', 'Create and manage your own Social Studio creator profile.\n\nYour profile connects your Discord account to your streaming accounts and live alerts.', interaction)], components: [row(button('user:module:social', 'My Creator Profile', ButtonStyle.Primary, false, '👤')), socialNavigation('user:home')] };
}

function buildUserDenied(interaction, roleIds = []) {
  const roleText = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join('\n') : 'No eligible roles are currently available.';
  return { embeds: [base('📣 Social Studio', `You do not currently have access to Social Studio.\n\n**Required role — one of:**\n${roleText}\n\nThe Social Studio button is unavailable until you receive an eligible role.`, interaction, '#FEE75C')], components: [row(button('user:social:locked', 'Social Studio', ButtonStyle.Secondary, true, '🔒')), socialNavigation()] };
}

function buildUserCreate(interaction) {
  return { embeds: [base('👥 Creator Profiles', 'You do not have a completed Creator Profile yet.\n\nSelect New Profile to complete the same Creator Profile form used by Social Studio Management.\n\nYour unique Creator ID and ownership are permanently attached to your Discord user ID.', interaction)], components: [...creatorActionRows(null, []), socialNavigation()] };
}

function buildUserProfile(interaction, creator, accounts = [], created = false) {
  if (creator.profileCompleted !== true) {
    return {
      embeds: [base('👥 My Creator Profile', [
        '⚠️ **Profile setup has not been submitted yet.**',
        '',
        'Select **New Profile** to finish creating your Creator Profile.',
      ].join('\n'), interaction, '#FEE75C')],
      components: [...creatorActionRows(creator, accounts), socialNavigation()],
    };
  }

  const status = creator.status === LEFT_SERVER ? 'Left Server' : creator.status === 'disabled' ? 'Disabled' : 'Active';
  const createdAt = creator.createdAt ? `<t:${Math.floor(new Date(creator.createdAt).getTime() / 1000)}:F>` : 'Unknown';
  const updatedAt = creator.updatedAt ? `<t:${Math.floor(new Date(creator.updatedAt).getTime() / 1000)}:R>` : 'Unknown';
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
    components: [...creatorActionRows(creator, accounts), socialNavigation()],
  };
}

function buildUserSection(interaction, creator, section, accounts = []) {
  const sections = {
    details: { title: '✏️ Manage Profile', description: `**Creator ID**\n\`${creator.creatorId}\`\n\n${creator.displayName ? `**Creator Name**\n${creator.displayName}\n\n` : ''}**Status**\n${creator.status || ACTIVE}\n\nCreator profile management will be connected here using the existing Social Studio profile functions.` },
    accounts: { title: '🔗 Accounts', description: `**Creator ID**\n\`${creator.creatorId}\`\n\n${accountSummary(accounts)}\n\nOnly accounts linked to your Creator Profile are shown here.` },
    alerts: { title: '📣 Post LIVE', description: 'Create and send a LIVE post for an account connected to your Creator Profile. Existing Social Studio posting and alert logic remains the source of truth.' },
  };
  const selected = sections[section] || sections.details;
  return { embeds: [base(selected.title, selected.description, interaction, '#FEE75C')], components: [sectionNavigation()] };
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
    || customId === 'user:social:create:submit'
    || customId === 'user:social:account:platforms'
    || customId === 'user:social:account:continue'
    || customId === 'user:social:account:create-multi'
    || /^user:social:(details|accounts|newAccount|manageAccount|alerts)$/.test(customId);
  if (!isSocial) return false;
  if (customId === 'user:category:social') return updatePanel(interaction, buildUserLanding(interaction));
  if (customId === 'user:social:create' && interaction.isButton?.()) {
    const access = getAccess(interaction);
    if (!access.allowed) return updatePanel(interaction, buildUserDenied(interaction, access.roleIds));
    const creator = findByOwnerDiscordId(interaction.guildId, interaction.user.id);
    if (creator?.profileCompleted === true) return updatePanel(interaction, buildUserProfile(interaction, creator, getAccountsForCreator(interaction.guildId, creator)));
    await interaction.showModal(userCreatorModal(creator, interaction));
    return true;
  }
  if (customId === 'user:social:create:submit' && interaction.isModalSubmit?.()) {
    const access = getAccess(interaction);
    if (!access.allowed) { await interaction.reply({ content: 'You no longer have access to Social Studio.', flags: 64 }); return true; }
    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) { await interaction.reply({ content: 'Creator display name is required.', flags: 64 }); return true; }
    const result = completeCreatorProfile(interaction.member, { displayName, group: interaction.fields.getTextInputValue('group'), tags: interaction.fields.getTextInputValue('tags'), notes: interaction.fields.getTextInputValue('notes') });
    const accounts = getAccountsForCreator(interaction.guildId, result.creator);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    return updatePanel(interaction, buildUserProfile(interaction, result.creator, accounts, true));
  }

  const context = getCreatorContext(interaction);
  if (context.payload) return updatePanel(interaction, context.payload);

  if (customId === 'user:social:newAccount' || customId === 'user:social:accounts') {
    setUserAccountSession(interaction, { platforms: [] });
    return updatePanel(interaction, buildUserAddAccounts(interaction, context.creator));
  }
  if (customId === 'user:social:account:platforms' && interaction.isStringSelectMenu?.()) {
    setUserAccountSession(interaction, { platforms: interaction.values || [] });
    return updatePanel(interaction, buildUserAddAccounts(interaction, context.creator));
  }
  if (customId === 'user:social:account:continue' && interaction.isButton?.()) {
    const platforms = getUserAccountSession(interaction).platforms || [];
    if (!platforms.length) return updatePanel(interaction, buildUserAddAccounts(interaction, context.creator));
    await interaction.showModal(userAccountModal(platforms));
    return true;
  }
  if (customId === 'user:social:account:create-multi' && interaction.isModalSubmit?.()) {
    const platforms = getUserAccountSession(interaction).platforms || [];
    if (!platforms.length) {
      await interaction.reply({ content: 'Select at least one platform before continuing.', flags: 64 });
      return true;
    }

    let creator = store.findCreatorByOwner(interaction.guildId, interaction.user.id);
    if (!creator) {
      await interaction.reply({ content: 'Your Creator Profile could not be found.', flags: 64 });
      return true;
    }

    for (const platform of platforms) {
      const value = interaction.fields.getTextInputValue(`account_${platform}`).trim();
      if (!value) continue;
      const result = upsertUserAccount(
        interaction.guildId,
        creator,
        platform,
        value,
        interaction.user.id,
      );
      creator = result.creator;
    }

    creator = store.getCreator(interaction.guildId, creator.creatorId) || creator;
    setUserAccountSession(interaction, { platforms: [] });
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    return updatePanel(interaction, buildUserProfile(interaction, creator, getAccountsForCreator(interaction.guildId, creator)));
  }

  const match = customId.match(/^user:social:(details|accounts|newAccount|manageAccount|alerts)$/);
  const section = ['newAccount', 'manageAccount'].includes(match?.[1]) ? 'accounts' : match?.[1];
  return updatePanel(interaction, section ? buildUserSection(interaction, context.creator, section, context.accounts) : buildUserProfile(interaction, context.creator, context.accounts));
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
  completeCreatorProfile,
  markMemberActive,
  markMemberLeft,
  deleteCreatorOwnedData,
};
