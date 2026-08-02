'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const socialStudio = require('./socialStudioUserService');

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const item = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) item.setEmoji(emoji);
  return item;
}

function row(...items) { return new ActionRowBuilder().addComponents(...items); }
function nameOf(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function base(title, description, interaction, color = '#5865F2') {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: `Requested by ${nameOf(interaction)}` }).setTimestamp();
}
function socialNavigation(backId = 'user:category:social') {
  return row(button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'), button('user:preferences', 'Settings', ButtonStyle.Secondary, false, '⚙️'));
}
function sectionNavigation(backId = 'user:social:open') {
  return row(button(backId, 'Back', ButtonStyle.Secondary, false, '⬅️'), button('user:preferences', 'Settings', ButtonStyle.Secondary, false, '⚙️'));
}
function creatorActionRows(hasCreator) {
  return [
    row(button('user:social:create', 'New Profile', ButtonStyle.Success, hasCreator, '➕'), button('user:social:accounts', 'Accounts', ButtonStyle.Primary, !hasCreator, '🔗'), button('user:social:alerts', 'Post LIVE', ButtonStyle.Primary, !hasCreator, '📣')),
    row(button('user:social:details', 'Manage Profile', ButtonStyle.Primary, !hasCreator, '✏️')),
  ];
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
function buildLanding(interaction) {
  return { embeds: [base('📣 Social Studio', ['Create and manage your own Social Studio creator profile.', '', 'Your profile connects your Discord account to your streaming accounts, live alerts and creator settings.'].join('\n'), interaction)], components: [row(button('user:module:social', 'My Creator Profile', ButtonStyle.Primary, false, '👤')), socialNavigation('user:home')] };
}
function buildDenied(interaction, roleIds = []) {
  const roleText = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join('\n') : 'No eligible roles are currently available.';
  return { embeds: [base('📣 Social Studio', ['You do not currently have access to Social Studio.', '', '**Required role — one of:**', roleText, '', 'The Social Studio button is unavailable until you receive an eligible role.'].join('\n'), interaction, '#FEE75C')], components: [row(button('user:social:locked', 'Social Studio', ButtonStyle.Secondary, true, '🔒')), socialNavigation()] };
}
function buildCreate(interaction) {
  return { embeds: [base('👥 Creator Profiles', ['You do not have a Creator Profile yet.', '', 'Create one to connect your Discord account to Social Studio.', '', 'Ownership is assigned automatically to your Discord account. You cannot select or change the owner.'].join('\n'), interaction)], components: [...creatorActionRows(false), socialNavigation()] };
}
function buildProfile(interaction, creator, accounts = [], created = false) {
  const status = creator.status === 'left_server' ? 'Left Server' : creator.status === 'disabled' ? 'Disabled' : 'Active';
  const createdAt = creator.createdAt ? `<t:${Math.floor(new Date(creator.createdAt).getTime() / 1000)}:F>` : 'Unknown';
  const updatedAt = creator.updatedAt ? `<t:${Math.floor(new Date(creator.updatedAt).getTime() / 1000)}:R>` : 'Unknown';
  return { embeds: [base('👥 My Creator Profile', [created ? '✅ **Creator Profile created.**' : null, `**Creator ID**\n\`${creator.creatorId}\``, creator.displayName ? `**Creator Name**\n${creator.displayName}` : null, `**Status**\n${status}`, accountSummary(accounts), `**Created**\n${createdAt}`, `**Last Updated**\n${updatedAt}`, '', 'Use the buttons below to manage your Creator Profile and linked accounts.'].filter(Boolean).join('\n\n'), interaction)], components: [...creatorActionRows(true), socialNavigation()] };
}
function buildSection(interaction, creator, section, accounts = []) {
  const sections = {
    details: { title: '✏️ Manage Profile', description: [`**Creator ID**\n\`${creator.creatorId}\``, creator.displayName ? `**Creator Name**\n${creator.displayName}` : null, `**Status**\n${creator.status || 'active'}`, '', 'Creator profile management will be connected here using the existing Social Studio profile functions.'].filter(Boolean).join('\n\n') },
    accounts: { title: '🔗 Accounts', description: [`**Creator ID**\n\`${creator.creatorId}\``, accountSummary(accounts), '', 'Only accounts linked to your Creator Profile are shown here.'].join('\n\n') },
    alerts: { title: '📣 Post LIVE', description: 'Create and send a LIVE post for an account connected to your Creator Profile. Existing Social Studio posting and alert logic remains the source of truth.' },
    templates: { title: '🎨 Templates', description: 'View and manage the templates available to your Creator Profile. Global template administration remains in the Admin Panel.' },
    notifications: { title: '🔔 Notifications', description: 'Manage Social Studio notifications available to your Creator Profile.' },
  };
  const selected = sections[section] || sections.details;
  return { embeds: [base(selected.title, selected.description, interaction, '#FEE75C')], components: [sectionNavigation()] };
}
function getCreatorContext(interaction) {
  const access = socialStudio.getAccess(interaction);
  if (!access.allowed) return { payload: buildDenied(interaction, access.roleIds) };
  const creator = socialStudio.findByOwnerDiscordId(interaction.guildId, interaction.user.id);
  if (!creator) return { payload: buildCreate(interaction) };
  return { creator, accounts: socialStudio.getAccountsForCreator(interaction.guildId, creator) };
}
async function handleUserInteraction(interaction, updatePanel) {
  const customId = String(interaction?.customId || '');
  const isSocial = customId === 'user:category:social' || customId === 'user:module:social' || customId === 'user:social:open' || customId === 'user:social:create' || /^user:social:(details|accounts|alerts|templates|notifications)$/.test(customId);
  if (!isSocial) return false;
  if (customId === 'user:category:social') return updatePanel(interaction, buildLanding(interaction));
  if (customId === 'user:social:create') {
    const access = socialStudio.getAccess(interaction);
    if (!access.allowed) return updatePanel(interaction, buildDenied(interaction, access.roleIds));
    const result = socialStudio.createForMember(interaction.member);
    const accounts = socialStudio.getAccountsForCreator(interaction.guildId, result.creator);
    return updatePanel(interaction, buildProfile(interaction, result.creator, accounts, result.created));
  }
  const context = getCreatorContext(interaction);
  if (context.payload) return updatePanel(interaction, context.payload);
  const match = customId.match(/^user:social:(details|accounts|alerts|templates|notifications)$/);
  return updatePanel(interaction, match ? buildSection(interaction, context.creator, match[1], context.accounts) : buildProfile(interaction, context.creator, context.accounts));
}
module.exports = { user: { buildLanding, buildDenied, buildCreate, buildProfile, buildSection, handleInteraction: handleUserInteraction, canAccess: (interaction) => socialStudio.getAccess(interaction).allowed } };
