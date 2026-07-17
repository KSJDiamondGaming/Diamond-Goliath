'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const invites = require('./invites');
const publicPanels = require('./invitesPublicPanels');
const PREFIX = 'invites:';
const sessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(Boolean(disabled));

function sessionFor(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (!sessions.has(key)) sessions.set(key, { page: 'overview' });
  return sessions.get(key);
}
function expiryLabel(seconds) { return ({ 0: 'Never', 1800: '30 minutes', 3600: '1 hour', 21600: '6 hours', 43200: '12 hours', 86400: '1 day', 604800: '7 days', 2592000: '30 days' })[Number(seconds)] || 'Never'; }
function usesLabel(value) { return Number(value) ? String(value) : 'Unlimited'; }
function roleList(roleIds) { return roleIds?.length ? roleIds.map((id) => `<@&${id}>`).join(', ') : 'None'; }
function expirySelect(id, current) { return new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(`Expire after: ${expiryLabel(current)}`).addOptions({ label: 'Never', value: '0' }, { label: '30 minutes', value: '1800' }, { label: '1 hour', value: '3600' }, { label: '6 hours', value: '21600' }, { label: '12 hours', value: '43200' }, { label: '1 day', value: '86400' }, { label: '7 days', value: '604800' }, { label: '30 days', value: '2592000' }); }
function usesSelect(id, current) { return new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(`Max uses: ${usesLabel(current)}`).addOptions({ label: 'Unlimited', value: '0' }, { label: '1 use', value: '1' }, { label: '5 uses', value: '5' }, { label: '10 uses', value: '10' }, { label: '25 uses', value: '25' }, { label: '50 uses', value: '50' }, { label: '100 uses', value: '100' }); }

function overview(interaction) {
  const section = invites.getSection(interaction.guildId);
  const official = section.settings.officialInvite;
  const member = section.settings.memberInviteTemplate;
  const panel = section.settings.publicPanel;
  const memberLinks = invites.listInviteLinks(interaction.guildId).filter((link) => link.personal).length;
  return {
    embeds: [new EmbedBuilder().setColor(section.enabled ? 0x57F287 : 0xED4245).setTitle('📨 Invite Studio').setDescription('Configure Goliath invites, the public leaderboard panel, and Invite Studio administration.').addFields(
      { name: 'Status', value: section.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Official Invite', value: official.code ? `https://discord.gg/${official.code}` : 'Not created', inline: true },
      { name: 'Member Links', value: String(memberLinks), inline: true },
      { name: 'Member Template', value: member.channelId ? 'Configured' : 'Not configured', inline: true },
      { name: 'Public Panel', value: panel.messageId ? 'Deployed' : 'Not deployed', inline: true },
      { name: 'Refresh', value: 'Every 2 hours', inline: true },
    ).setFooter({ text: 'Official Goliath invites never appear on member leaderboards.' })],
    components: [
      row(button('invites:goliath', 'Configure Goliath', ButtonStyle.Primary), button('invites:public-config', 'Configure Public', ButtonStyle.Primary), button('invites:admin-config', 'Admin', ButtonStyle.Primary)),
      row(button('admin:modules', 'Back to Modules')),
    ],
  };
}

function goliathView(interaction) {
  const section = invites.getSection(interaction.guildId);
  const official = section.settings.officialInvite;
  const member = section.settings.memberInviteTemplate;
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🤖 Configure Goliath').setDescription('Configure the official server invite and the one-click personal invite template used by members.').addFields(
      { name: 'Official Invite', value: official.code ? `https://discord.gg/${official.code}` : 'Not created', inline: true },
      { name: 'Official Channel', value: official.channelId ? `<#${official.channelId}>` : 'Not selected', inline: true },
      { name: 'Member Links', value: member.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Member Channel', value: member.channelId ? `<#${member.channelId}>` : 'Not selected', inline: true },
      { name: 'Member Roles', value: roleList(member.roleIds), inline: false },
    )],
    components: [row(button('invites:official-settings', 'Official Invite Settings', ButtonStyle.Primary), button('invites:member-settings', 'Member Link Settings', ButtonStyle.Primary)), row(button('invites:home', 'Back'))],
  };
}

function officialView(interaction) {
  const config = invites.getSection(interaction.guildId).settings.officialInvite;
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🌍 Official Goliath Invite').setDescription('This link is used by the public panel and is excluded from every member leaderboard.').addFields(
      { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not selected', inline: true },
      { name: 'Invite', value: config.code ? `https://discord.gg/${config.code}` : 'Not created', inline: true },
      { name: 'Expires', value: expiryLabel(config.maxAge), inline: true },
      { name: 'Maximum Uses', value: usesLabel(config.maxUses), inline: true },
      { name: 'Temporary Membership', value: config.temporary ? 'On' : 'Off', inline: true },
      { name: 'Roles Granted', value: roleList(config.roleIds), inline: false },
    )],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('invites:official-channel').setPlaceholder('Select official invite channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(expirySelect('invites:official-expiry', config.maxAge)),
      row(usesSelect('invites:official-uses', config.maxUses)),
      row(new RoleSelectMenuBuilder().setCustomId('invites:official-roles').setPlaceholder('Roles for official invitees (optional)').setMinValues(0).setMaxValues(10)),
      row(button('invites:official-temporary', config.temporary ? 'Temporary: On' : 'Temporary: Off'), button('invites:official-create', config.code ? 'Apply / Verify Link' : 'Create Link', ButtonStyle.Success, !config.channelId), button('invites:goliath', 'Back')),
    ],
  };
}

function memberTemplateView(interaction) {
  const config = invites.getSection(interaction.guildId).settings.memberInviteTemplate;
  return {
    embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Member Link Settings').setDescription('Members press **Get My Link** once. Goliath creates one personal link using these settings and reuses it thereafter.').addFields(
      { name: 'Member Links', value: config.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not selected', inline: true },
      { name: 'Expiry', value: expiryLabel(config.maxAge), inline: true },
      { name: 'Maximum Uses', value: usesLabel(config.maxUses), inline: true },
      { name: 'Temporary Membership', value: config.temporary ? 'On' : 'Off', inline: true },
      { name: 'Auto Replace Missing', value: config.autoReplaceMissing ? 'On' : 'Off', inline: true },
      { name: 'Roles Granted', value: roleList(config.roleIds), inline: false },
    )],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('invites:member-channel').setPlaceholder('Select member invite channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(expirySelect('invites:member-expiry', config.maxAge)),
      row(usesSelect('invites:member-uses', config.maxUses)),
      row(new RoleSelectMenuBuilder().setCustomId('invites:member-roles').setPlaceholder('Roles automatically granted to invitees').setMinValues(0).setMaxValues(10)),
      row(button('invites:member-temporary', config.temporary ? 'Temporary: On' : 'Temporary: Off'), button('invites:member-enabled', config.enabled ? 'Links: On' : 'Links: Off'), button('invites:member-autoreplace', config.autoReplaceMissing ? 'Auto Replace: On' : 'Auto Replace: Off'), button('invites:goliath', 'Back')),
    ],
  };
}

function publicSettingsView(interaction) {
  const section = invites.getSection(interaction.guildId);
  const config = section.settings.publicPanel;
  return {
    embeds: [new EmbedBuilder().setColor(config.color).setTitle('📣 Configure Public Panel').setDescription('Choose where the public invite and member leaderboard panel is deployed.').addFields(
      { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not selected', inline: true },
      { name: 'Status', value: config.messageId ? 'Deployed' : 'Not deployed', inline: true },
      { name: 'Leaderboard Size', value: `Top ${config.leaderboardLimit}`, inline: true },
      { name: 'Automatic Refresh', value: 'Every 2 hours', inline: true },
      { name: 'Official Invite', value: section.settings.officialInvite.code ? 'Ready' : 'Not created', inline: true },
    )],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('invites:panel-channel').setPlaceholder('Select public panel channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(new StringSelectMenuBuilder().setCustomId('invites:panel-limit').setPlaceholder(`Leaderboard: Top ${config.leaderboardLimit}`).addOptions({ label: 'Top 5', value: '5' }, { label: 'Top 10', value: '10' }, { label: 'Top 15', value: '15' }, { label: 'Top 20', value: '20' }, { label: 'Top 25', value: '25' })),
      row(button('invites:panel-deploy', config.messageId ? 'Update Panel' : 'Deploy Panel', ButtonStyle.Success, !config.channelId || !section.settings.officialInvite.code), button('invites:panel-refresh', 'Refresh Now', ButtonStyle.Secondary, !config.messageId), button('invites:home', 'Back')),
    ],
  };
}

function adminView(interaction) {
  const section = invites.getSection(interaction.guildId);
  return {
    embeds: [new EmbedBuilder().setColor(section.enabled ? 0x57F287 : 0xED4245).setTitle('🛠️ Invite Studio Admin').setDescription('Edit user-facing messages and run Invite Studio maintenance.').addFields(
      { name: 'Module Status', value: section.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Panel Message', value: 'Editable', inline: true },
      { name: 'Member DM', value: 'Editable', inline: true },
    )],
    components: [
      row(button('invites:panel-embed-modal', 'Edit Panel Embed', ButtonStyle.Primary), button('invites:member-dm-modal', 'Edit Member DM', ButtonStyle.Primary)),
      row(button('invites:health', 'Health'), button('invites:repair', 'Repair'), button('invites:toggle', section.enabled ? 'Disable' : 'Enable', section.enabled ? ButtonStyle.Danger : ButtonStyle.Success)),
      row(button('invites:home', 'Back')),
    ],
  };
}

function buildInviteStudioPayload(interaction, forcedPage = null) {
  const state = sessionFor(interaction);
  if (forcedPage === 'configure') state.page = 'overview';
  if (state.page === 'goliath') return goliathView(interaction);
  if (state.page === 'official-settings') return officialView(interaction);
  if (state.page === 'member-settings') return memberTemplateView(interaction);
  if (state.page === 'public-config') return publicSettingsView(interaction);
  if (state.page === 'admin-config') return adminView(interaction);
  return overview(interaction);
}
async function updatePanel(interaction) { const payload = buildInviteStudioPayload(interaction); if (interaction.deferred || interaction.replied) await interaction.editReply(payload); else await interaction.update(payload); }
function updateNestedSettings(guildId, key, patch, meta) { const section = invites.getSection(guildId); invites.updateSettings(guildId, { [key]: { ...section.settings[key], ...patch } }, meta); }
function dmModal(interaction) { const config = invites.getSection(interaction.guildId).settings.memberInviteTemplate; return new ModalBuilder().setCustomId('invites:member-dm-submit').setTitle('Edit Member Invite DM').addComponents(row(new TextInputBuilder().setCustomId('title').setLabel('DM title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(config.dmTitle)), row(new TextInputBuilder().setCustomId('message').setLabel('DM message').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500).setValue(config.dmMessage))); }
function embedModal(interaction) { const config = invites.getSection(interaction.guildId).settings.publicPanel; return new ModalBuilder().setCustomId('invites:panel-embed-submit').setTitle('Edit Invite Panel').addComponents(row(new TextInputBuilder().setCustomId('title').setLabel('Embed title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(config.title)), row(new TextInputBuilder().setCustomId('description').setLabel('Embed description').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(config.description)), row(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2048).setValue(config.footer)), row(new TextInputBuilder().setCustomId('button').setLabel('Official invite button label').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(config.buttonLabel)), row(new TextInputBuilder().setCustomId('color').setLabel('Embed colour (hex)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setValue(config.color))); }

async function handleInviteStudioInteraction(interaction) {
  if (!String(interaction.customId || '').startsWith(PREFIX)) return false;
  const customId = String(interaction.customId);
  const isManagement = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const managementMemberIds = new Set(['invites:member-settings', 'invites:member-channel', 'invites:member-roles', 'invites:member-expiry', 'invites:member-uses', 'invites:member-temporary', 'invites:member-enabled', 'invites:member-autoreplace', 'invites:member-dm-modal', 'invites:member-dm-submit']);
  if (customId.startsWith('invites:member-') && !managementMemberIds.has(customId) && !isManagement) return publicPanels.handleMemberInteraction(interaction);
  if (!isManagement) throw new Error('Manage Server permission is required.');
  const action = customId.slice(PREFIX.length);
  const state = sessionFor(interaction);
  const meta = { actorId: interaction.user.id, action: `invites_panel_${action}` };

  if (action === 'home') state.page = 'overview';
  else if (['goliath', 'official-settings', 'member-settings', 'public-config', 'admin-config'].includes(action)) state.page = action;
  else if (action === 'toggle') invites.setEnabled(interaction.guildId, !invites.getSection(interaction.guildId).enabled, meta);
  else if (action === 'official-channel' && interaction.isChannelSelectMenu()) updateNestedSettings(interaction.guildId, 'officialInvite', { channelId: interaction.values[0] }, meta);
  else if (action === 'official-roles' && interaction.isRoleSelectMenu()) updateNestedSettings(interaction.guildId, 'officialInvite', { roleIds: interaction.values }, meta);
  else if (action === 'official-expiry' && interaction.isStringSelectMenu()) updateNestedSettings(interaction.guildId, 'officialInvite', { maxAge: Number(interaction.values[0]) }, meta);
  else if (action === 'official-uses' && interaction.isStringSelectMenu()) updateNestedSettings(interaction.guildId, 'officialInvite', { maxUses: Number(interaction.values[0]) }, meta);
  else if (action === 'official-temporary') { const current = invites.getSection(interaction.guildId).settings.officialInvite; updateNestedSettings(interaction.guildId, 'officialInvite', { temporary: !current.temporary }, meta); }
  else if (action === 'official-create') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const result = await invites.ensureOfficialInvite(interaction.guild, meta); await interaction.editReply(result.created ? `✅ Official invite created: ${result.invite.url}` : `✅ Existing official invite verified: ${result.invite.url}`); return true; }
  else if (action === 'member-channel' && interaction.isChannelSelectMenu()) updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { channelId: interaction.values[0] }, meta);
  else if (action === 'member-roles' && interaction.isRoleSelectMenu()) updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { roleIds: interaction.values }, meta);
  else if (action === 'member-expiry' && interaction.isStringSelectMenu()) updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { maxAge: Number(interaction.values[0]) }, meta);
  else if (action === 'member-uses' && interaction.isStringSelectMenu()) updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { maxUses: Number(interaction.values[0]) }, meta);
  else if (action === 'member-temporary') { const current = invites.getSection(interaction.guildId).settings.memberInviteTemplate; updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { temporary: !current.temporary }, meta); }
  else if (action === 'member-enabled') { const current = invites.getSection(interaction.guildId).settings.memberInviteTemplate; updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { enabled: !current.enabled }, meta); }
  else if (action === 'member-autoreplace') { const current = invites.getSection(interaction.guildId).settings.memberInviteTemplate; updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { autoReplaceMissing: !current.autoReplaceMissing }, meta); }
  else if (action === 'member-dm-modal') { await interaction.showModal(dmModal(interaction)); return true; }
  else if (action === 'member-dm-submit' && interaction.isModalSubmit()) { updateNestedSettings(interaction.guildId, 'memberInviteTemplate', { dmTitle: interaction.fields.getTextInputValue('title'), dmMessage: interaction.fields.getTextInputValue('message') }, meta); await interaction.reply({ content: '✅ Member invite DM updated.', flags: MessageFlags.Ephemeral }); return true; }
  else if (action === 'panel-channel' && interaction.isChannelSelectMenu()) updateNestedSettings(interaction.guildId, 'publicPanel', { channelId: interaction.values[0] }, meta);
  else if (action === 'panel-limit' && interaction.isStringSelectMenu()) updateNestedSettings(interaction.guildId, 'publicPanel', { leaderboardLimit: Number(interaction.values[0]) }, meta);
  else if (action === 'panel-embed-modal') { await interaction.showModal(embedModal(interaction)); return true; }
  else if (action === 'panel-embed-submit' && interaction.isModalSubmit()) { const color = interaction.fields.getTextInputValue('color').trim(); if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Embed colour must be a hex value such as #5865F2.'); updateNestedSettings(interaction.guildId, 'publicPanel', { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), footer: interaction.fields.getTextInputValue('footer'), buttonLabel: interaction.fields.getTextInputValue('button'), color }, meta); await interaction.reply({ content: '✅ Public panel message updated.', flags: MessageFlags.Ephemeral }); return true; }
  else if (action === 'panel-deploy') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const message = await publicPanels.deployPublicPanel(interaction.guild, meta); publicPanels.startAutoRefresh(interaction.guild); await interaction.editReply(`✅ Invite panel deployed in <#${message.channelId}>.`); return true; }
  else if (action === 'panel-refresh') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const ok = await publicPanels.refreshPublicPanel(interaction.guild, meta); await interaction.editReply(ok ? '✅ Invite panel refreshed.' : '❌ Deployed panel not found.'); return true; }
  else if (action === 'health') { const health = await invites.buildHealth(interaction.guild); await interaction.reply({ content: health.healthy ? `✅ Invite Studio is healthy. ${health.warnings.length} warning(s).` : `⚠️ ${health.issues.length} issue(s), ${health.warnings.length} warning(s).`, flags: MessageFlags.Ephemeral }); return true; }
  else if (action === 'repair') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const health = await invites.repair(interaction.guild, meta); await interaction.editReply(health.healthy ? '✅ Repair complete.' : '⚠️ Repair completed, but issues remain.'); return true; }
  else return publicPanels.handleMemberInteraction(interaction);
  await updatePanel(interaction);
  return true;
}

module.exports = { buildInviteStudioPayload, handleInviteStudioInteraction };
