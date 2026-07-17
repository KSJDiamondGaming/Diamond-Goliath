'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const invites = require('./invites');
const publicPanels = require('./invitesPublicPanels');

const PREFIX = 'invites:';
const sessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const textInput = (id, label, style, value, maxLength) => new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(maxLength).setValue(String(value || '').slice(0, maxLength));

function getSession(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (!sessions.has(key)) sessions.set(key, { page: 'overview', draft: { channelId: interaction.channelId || null, roleIds: [], maxAge: 2592000, maxUses: 0, temporary: false } });
  return sessions.get(key);
}
function expiryLabel(seconds) { return ({ 0: 'Never', 1800: '30 minutes', 3600: '1 hour', 21600: '6 hours', 43200: '12 hours', 86400: '1 day', 604800: '7 days', 2592000: '30 days' })[Number(seconds)] || 'Never'; }
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#5865F2'; }

function overview(interaction) {
  const section = invites.getSection(interaction.guildId);
  const links = invites.listInviteLinks(interaction.guildId);
  const config = publicPanels.panelConfig(interaction.guildId);
  const embed = new EmbedBuilder().setColor(section.enabled ? 0x57F287 : 0xED4245).setTitle('📨 Invite Studio').setDescription('Create private invite links, deploy a public invite embed, and maintain a live leaderboard.').addFields(
    { name: 'Status', value: section.enabled ? 'Enabled' : 'Disabled', inline: true },
    { name: 'Invite links', value: String(links.length), inline: true },
    { name: 'Tracked joins', value: String(section.analytics?.tracked || 0), inline: true },
    { name: 'Public panel', value: config.publicPanel.messageId ? 'Deployed' : 'Not deployed', inline: true },
    { name: 'Leaderboard', value: config.leaderboardPanel.messageId ? 'Deployed' : 'Not deployed', inline: true },
    { name: 'Roles granted', value: String(section.analytics?.inviteRolesGranted || 0), inline: true },
  ).setFooter({ text: 'Admin Hub › Modules › Invite Studio' });
  return { embeds: [embed], components: [
    row(button('invites:create', 'Create Invite Link', ButtonStyle.Primary), button('invites:links', 'Invite Links'), button('invites:public', 'Public Invite Panel'), button('invites:leaderboard', 'Leaderboard Panel')),
    row(button('invites:sync', 'Sync Invites'), button('invites:health', 'Health'), button('invites:repair', 'Repair'), button('invites:toggle', section.enabled ? 'Disable' : 'Enable', section.enabled ? ButtonStyle.Danger : ButtonStyle.Success), button('admin:modules', 'Back')),
  ] };
}

function createView(interaction) {
  const draft = getSession(interaction).draft;
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('🔗 Create Invite Link').setDescription('This link is only shown to you after creation. You can later select a permanent link for the public panel.').addFields(
    { name: 'Channel', value: draft.channelId ? `<#${draft.channelId}>` : 'Not selected', inline: true },
    { name: 'Expire after', value: expiryLabel(draft.maxAge), inline: true },
    { name: 'Max uses', value: draft.maxUses ? String(draft.maxUses) : 'No limit', inline: true },
    { name: 'Roles (optional)', value: draft.roleIds.length ? draft.roleIds.map((id) => `<@&${id}>`).join(', ') : 'None', inline: false },
    { name: 'Temporary membership', value: draft.temporary ? 'Enabled' : 'Disabled', inline: true },
  );
  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('invites:draft-channel').setPlaceholder('Select invite channel').addChannelTypes(ChannelType.GuildText)),
    row(new StringSelectMenuBuilder().setCustomId('invites:draft-expiry').setPlaceholder(`Expire after: ${expiryLabel(draft.maxAge)}`).addOptions(
      { label: '30 minutes', value: '1800' }, { label: '1 hour', value: '3600' }, { label: '6 hours', value: '21600' }, { label: '12 hours', value: '43200' }, { label: '1 day', value: '86400' }, { label: '7 days', value: '604800' }, { label: '30 days', value: '2592000' }, { label: 'Never', value: '0' })),
    row(new StringSelectMenuBuilder().setCustomId('invites:draft-uses').setPlaceholder(`Max uses: ${draft.maxUses || 'No limit'}`).addOptions(
      { label: 'No limit', value: '0' }, { label: '1 use', value: '1' }, { label: '5 uses', value: '5' }, { label: '10 uses', value: '10' }, { label: '25 uses', value: '25' }, { label: '50 uses', value: '50' }, { label: '100 uses', value: '100' })),
    row(new RoleSelectMenuBuilder().setCustomId('invites:draft-roles').setPlaceholder('Roles (optional)').setMinValues(0).setMaxValues(10)),
    row(button('invites:draft-temporary', draft.temporary ? 'Temporary Membership: On' : 'Temporary Membership: Off', draft.temporary ? ButtonStyle.Success : ButtonStyle.Secondary), button('invites:generate', 'Generate Invite', ButtonStyle.Primary, !draft.channelId), button('invites:home', 'Cancel')),
  ] };
}

function linksView(interaction) {
  const links = invites.listInviteLinks(interaction.guildId);
  const description = links.length ? links.slice(0, 20).map((link) => {
    const roles = link.roleIds?.length ? link.roleIds.map((id) => `<@&${id}>`).join(', ') : 'No roles';
    const expiry = link.expiresAt ? `<t:${Math.floor(new Date(link.expiresAt).getTime() / 1000)}:R>` : 'Never';
    return `**${link.code}** · ${link.uses || 0}${link.maxUses ? `/${link.maxUses}` : ''} uses · ${expiry}\n${roles}`;
  }).join('\n\n') : 'No Invite Studio links have been created.';
  return { embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🔗 Invite Links').setDescription(description)], components: [row(button('invites:create', 'Create Invite Link', ButtonStyle.Primary), button('invites:delete', 'Delete Link', ButtonStyle.Danger, !links.length), button('invites:home', 'Back'))] };
}

function publicPanelView(interaction) {
  const config = publicPanels.panelConfig(interaction.guildId).publicPanel;
  const links = invites.listInviteLinks(interaction.guildId).filter((link) => link.maxAge === 0 && link.maxUses === 0);
  const embed = new EmbedBuilder().setColor(safeColor(config.color)).setTitle('📣 Public Invite Panel').setDescription('Choose a permanent Invite Studio link, customise the embed, then deploy or update one public message.').addFields(
    { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not selected', inline: true },
    { name: 'Invite', value: config.inviteCode ? `https://discord.gg/${config.inviteCode}` : 'Not selected', inline: true },
    { name: 'Message', value: config.messageId ? `Deployed (${config.messageId})` : 'Not deployed', inline: true },
    { name: 'Title', value: config.title, inline: false },
    { name: 'Description', value: config.description.slice(0, 1000), inline: false },
  );
  const components = [row(new ChannelSelectMenuBuilder().setCustomId('invites:public-channel').setPlaceholder('Select public panel channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))];
  if (links.length) components.push(row(new StringSelectMenuBuilder().setCustomId('invites:public-link').setPlaceholder('Select permanent invite link').addOptions(links.slice(0, 25).map((link) => ({ label: link.code, description: `${link.uses || 0} uses • ${link.roleIds.length} role(s)`, value: link.code }))));
  components.push(row(button('invites:public-edit', 'Edit Embed', ButtonStyle.Primary), button('invites:public-deploy', config.messageId ? 'Update Public Panel' : 'Deploy Public Panel', ButtonStyle.Success, !config.channelId || !config.inviteCode), button('invites:home', 'Back')));
  return { embeds: [embed], components };
}

function leaderboardPanelView(interaction) {
  const config = publicPanels.panelConfig(interaction.guildId).leaderboardPanel;
  const embed = new EmbedBuilder().setColor(safeColor(config.color)).setTitle('🏆 Leaderboard Panel').setDescription('Deploy one editable leaderboard message. It updates automatically when tracked members join or leave.').addFields(
    { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not selected', inline: true },
    { name: 'Message', value: config.messageId ? `Deployed (${config.messageId})` : 'Not deployed', inline: true },
    { name: 'Entries shown', value: String(config.limit || 10), inline: true },
    { name: 'Title', value: config.title, inline: false },
    { name: 'Description', value: config.description, inline: false },
  );
  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('invites:leaderboard-channel').setPlaceholder('Select leaderboard channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    row(button('invites:leaderboard-edit', 'Edit Embed', ButtonStyle.Primary), button('invites:leaderboard-deploy', config.messageId ? 'Update Leaderboard' : 'Deploy Leaderboard', ButtonStyle.Success, !config.channelId), button('invites:leaderboard-refresh', 'Refresh Now', ButtonStyle.Secondary, !config.messageId), button('invites:home', 'Back')),
  ] };
}

function publicEditModal(guildId) {
  const config = publicPanels.panelConfig(guildId).publicPanel;
  return new ModalBuilder().setCustomId('invites:public-edit-modal').setTitle('Edit Public Invite Embed').addComponents(
    row(textInput('title', 'Title', TextInputStyle.Short, config.title, 256)),
    row(textInput('description', 'Description', TextInputStyle.Paragraph, config.description, 4000)),
    row(textInput('color', 'Colour (#5865F2)', TextInputStyle.Short, config.color, 7)),
    row(textInput('footer', 'Footer', TextInputStyle.Short, config.footer, 2048)),
    row(textInput('buttonLabel', 'Invite button label', TextInputStyle.Short, config.buttonLabel, 80)),
  );
}
function leaderboardEditModal(guildId) {
  const config = publicPanels.panelConfig(guildId).leaderboardPanel;
  return new ModalBuilder().setCustomId('invites:leaderboard-edit-modal').setTitle('Edit Leaderboard Embed').addComponents(
    row(textInput('title', 'Title', TextInputStyle.Short, config.title, 256)),
    row(textInput('description', 'Description', TextInputStyle.Paragraph, config.description, 1200)),
    row(textInput('color', 'Colour (#5865F2)', TextInputStyle.Short, config.color, 7)),
    row(textInput('footer', 'Footer', TextInputStyle.Short, config.footer, 2048)),
    row(textInput('limit', 'Entries shown (3-25)', TextInputStyle.Short, config.limit, 2)),
  );
}
function modalValue(interaction, id) { return interaction.fields.getTextInputValue(id).trim(); }

function buildInviteStudioPayload(interaction) {
  const page = getSession(interaction).page;
  if (page === 'create') return createView(interaction);
  if (page === 'links') return linksView(interaction);
  if (page === 'public') return publicPanelView(interaction);
  if (page === 'leaderboard') return leaderboardPanelView(interaction);
  return overview(interaction);
}

async function handleInviteStudioInteraction(interaction) {
  if (!String(interaction.customId || '').startsWith(PREFIX)) return false;
  if (interaction.customId === 'invites:member-help') return publicPanels.handleMemberHelp(interaction);
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Manage Server permission is required.');
  const state = getSession(interaction);
  const action = interaction.customId.slice(PREFIX.length);
  const meta = { actorId: interaction.user.id, action: `invites_panel_${action}` };

  if (action === 'home') { state.page = 'overview'; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (['create', 'links', 'public', 'leaderboard'].includes(action)) { state.page = action; if (action === 'create') state.draft = { channelId: interaction.channelId || null, roleIds: [], maxAge: 2592000, maxUses: 0, temporary: false }; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'toggle') { const current = invites.getSection(interaction.guildId); invites.setEnabled(interaction.guildId, !current.enabled, meta); await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'sync') { await interaction.deferUpdate(); await invites.syncGuild(interaction.guild, meta); await interaction.editReply(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'health') { const health = await invites.buildHealth(interaction.guild); await interaction.reply({ content: health.healthy ? '✅ Invite Studio is healthy.' : `⚠️ ${health.issues.length} issue(s), ${health.warnings.length} warning(s).`, flags: MessageFlags.Ephemeral }); return true; }
  if (action === 'repair') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const health = await invites.repair(interaction.guild, meta); await interaction.editReply(health.healthy ? '✅ Repair completed and Invite Studio is healthy.' : '⚠️ Repair completed, but issues remain.'); return true; }
  if (action === 'draft-channel' && interaction.isChannelSelectMenu()) state.draft.channelId = interaction.values[0];
  else if (action === 'draft-expiry' && interaction.isStringSelectMenu()) state.draft.maxAge = Number(interaction.values[0]);
  else if (action === 'draft-uses' && interaction.isStringSelectMenu()) state.draft.maxUses = Number(interaction.values[0]);
  else if (action === 'draft-roles' && interaction.isRoleSelectMenu()) state.draft.roleIds = interaction.values;
  else if (action === 'draft-temporary') state.draft.temporary = !state.draft.temporary;
  else if (action === 'public-channel' && interaction.isChannelSelectMenu()) publicPanels.savePanelConfig(interaction.guildId, 'publicPanel', { channelId: interaction.values[0] }, meta);
  else if (action === 'public-link' && interaction.isStringSelectMenu()) publicPanels.savePanelConfig(interaction.guildId, 'publicPanel', { inviteCode: interaction.values[0] }, meta);
  else if (action === 'leaderboard-channel' && interaction.isChannelSelectMenu()) publicPanels.savePanelConfig(interaction.guildId, 'leaderboardPanel', { channelId: interaction.values[0] }, meta);
  else if (action === 'public-edit') { await interaction.showModal(publicEditModal(interaction.guildId)); return true; }
  else if (action === 'leaderboard-edit') { await interaction.showModal(leaderboardEditModal(interaction.guildId)); return true; }
  else if (action === 'public-edit-modal' && interaction.isModalSubmit()) {
    publicPanels.savePanelConfig(interaction.guildId, 'publicPanel', { title: modalValue(interaction, 'title'), description: modalValue(interaction, 'description'), color: modalValue(interaction, 'color'), footer: modalValue(interaction, 'footer'), buttonLabel: modalValue(interaction, 'buttonLabel') }, meta);
    await interaction.reply({ content: '✅ Public invite embed saved.', flags: MessageFlags.Ephemeral }); return true;
  } else if (action === 'leaderboard-edit-modal' && interaction.isModalSubmit()) {
    publicPanels.savePanelConfig(interaction.guildId, 'leaderboardPanel', { title: modalValue(interaction, 'title'), description: modalValue(interaction, 'description'), color: modalValue(interaction, 'color'), footer: modalValue(interaction, 'footer'), limit: Math.max(3, Math.min(25, Number(modalValue(interaction, 'limit')) || 10)) }, meta);
    await interaction.reply({ content: '✅ Leaderboard embed saved.', flags: MessageFlags.Ephemeral }); return true;
  } else if (action === 'public-deploy') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try { const message = await publicPanels.deployPublicPanel(interaction.guild, meta); await interaction.editReply(`✅ Public invite panel deployed in <#${message.channelId}>.`); } catch (error) { await interaction.editReply(`❌ ${error.message}`); } return true;
  } else if (action === 'leaderboard-deploy') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try { const message = await publicPanels.deployLeaderboardPanel(interaction.guild, meta); await interaction.editReply(`✅ Leaderboard deployed in <#${message.channelId}>.`); } catch (error) { await interaction.editReply(`❌ ${error.message}`); } return true;
  } else if (action === 'leaderboard-refresh') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const refreshed = await publicPanels.refreshLeaderboard(interaction.guild); await interaction.editReply(refreshed ? '✅ Leaderboard refreshed.' : '❌ The deployed leaderboard message could not be found.'); return true;
  } else if (action === 'generate') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try { const result = await invites.createInviteLink(interaction.guild, state.draft, meta); state.page = 'links'; await interaction.editReply(`✅ Invite created: ${result.invite.url}${result.record.roleIds.length ? `\nRoles: ${result.record.roleIds.map((id) => `<@&${id}>`).join(', ')}` : ''}`); }
    catch (error) { console.error('[InviteStudio] Failed to create invite:', error); await interaction.editReply(`❌ ${String(error?.message || error).slice(0, 1800)}`); }
    return true;
  } else if (action === 'delete') {
    const links = invites.listInviteLinks(interaction.guildId);
    const modal = new ModalBuilder().setCustomId('invites:delete-modal').setTitle('Delete invite link').addComponents(row(new TextInputBuilder().setCustomId('code').setLabel('Invite code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(links[0]?.code || 'abc123')));
    await interaction.showModal(modal); return true;
  } else if (action === 'delete-modal' && interaction.isModalSubmit()) {
    const code = interaction.fields.getTextInputValue('code').trim(); await invites.deleteInviteLink(interaction.guild, code, meta); state.page = 'links'; await interaction.reply({ content: `✅ Invite ${code} deleted.`, flags: MessageFlags.Ephemeral }); return true;
  } else return false;

  await interaction.update(buildInviteStudioPayload(interaction));
  return true;
}

module.exports = { buildInviteStudioPayload, handleInviteStudioInteraction };