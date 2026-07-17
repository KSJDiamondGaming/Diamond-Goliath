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

const PREFIX = 'invites:';
const sessions = new Map();
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

function getSession(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (!sessions.has(key)) sessions.set(key, { page: 'overview', draft: { channelId: interaction.channelId || null, roleIds: [], maxAge: 2592000, maxUses: 0, temporary: false } });
  return sessions.get(key);
}

function expiryLabel(seconds) {
  return ({ 0: 'Never', 1800: '30 minutes', 3600: '1 hour', 21600: '6 hours', 43200: '12 hours', 86400: '1 day', 604800: '7 days', 2592000: '30 days' })[Number(seconds)] || 'Never';
}

function overview(interaction) {
  const section = invites.getSection(interaction.guildId);
  const links = invites.listInviteLinks(interaction.guildId);
  const embed = new EmbedBuilder()
    .setColor(section.enabled ? 0x57F287 : 0xED4245)
    .setTitle('📨 Invite Studio')
    .setDescription('Create Discord-style invite links with optional roles and manage invite tracking from this panel.')
    .addFields(
      { name: 'Status', value: section.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Invite links', value: String(links.length), inline: true },
      { name: 'Tracked joins', value: String(section.analytics?.tracked || 0), inline: true },
      { name: 'Unknown joins', value: String(section.analytics?.unknown || 0), inline: true },
      { name: 'Roles granted', value: String(section.analytics?.inviteRolesGranted || 0), inline: true },
      { name: 'Reward roles', value: String(section.settings?.rewardRoles?.length || 0), inline: true },
    )
    .setFooter({ text: 'Admin Hub › Modules › Invite Studio' });

  return { embeds: [embed], components: [
    row(button('invites:create', 'Create Invite Link', ButtonStyle.Primary), button('invites:links', 'Invite Links'), button('invites:sync', 'Sync Invites'), button('invites:toggle', section.enabled ? 'Disable' : 'Enable', section.enabled ? ButtonStyle.Danger : ButtonStyle.Success)),
    row(button('invites:health', 'Health'), button('invites:repair', 'Repair'), button('admin:modules', 'Back to Modules')),
  ] };
}

function createView(interaction) {
  const draft = getSession(interaction).draft;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🔗 Create Invite Link')
    .setDescription('Choose the same core options Discord provides, including optional roles for members joining through this link.')
    .addFields(
      { name: 'Channel', value: draft.channelId ? `<#${draft.channelId}>` : 'Not selected', inline: true },
      { name: 'Expire after', value: expiryLabel(draft.maxAge), inline: true },
      { name: 'Max uses', value: draft.maxUses ? String(draft.maxUses) : 'No limit', inline: true },
      { name: 'Roles (optional)', value: draft.roleIds.length ? draft.roleIds.map((id) => `<@&${id}>`).join(', ') : 'None', inline: false },
      { name: 'Temporary membership', value: draft.temporary ? 'Enabled' : 'Disabled', inline: true },
    );

  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('invites:draft-channel').setPlaceholder('Select invite channel').addChannelTypes(ChannelType.GuildText)),
    row(new StringSelectMenuBuilder().setCustomId('invites:draft-expiry').setPlaceholder(`Expire after: ${expiryLabel(draft.maxAge)}`).addOptions(
      { label: '30 minutes', value: '1800' }, { label: '1 hour', value: '3600' }, { label: '6 hours', value: '21600' }, { label: '12 hours', value: '43200' }, { label: '1 day', value: '86400' }, { label: '7 days', value: '604800' }, { label: '30 days', value: '2592000' }, { label: 'Never', value: '0' },
    )),
    row(new StringSelectMenuBuilder().setCustomId('invites:draft-uses').setPlaceholder(`Max uses: ${draft.maxUses || 'No limit'}`).addOptions(
      { label: 'No limit', value: '0' }, { label: '1 use', value: '1' }, { label: '5 uses', value: '5' }, { label: '10 uses', value: '10' }, { label: '25 uses', value: '25' }, { label: '50 uses', value: '50' }, { label: '100 uses', value: '100' },
    )),
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

function buildInviteStudioPayload(interaction) {
  const state = getSession(interaction);
  if (state.page === 'create') return createView(interaction);
  if (state.page === 'links') return linksView(interaction);
  return overview(interaction);
}

async function handleInviteStudioInteraction(interaction) {
  if (!String(interaction.customId || '').startsWith(PREFIX)) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Manage Server permission is required.');
  const state = getSession(interaction);
  const action = interaction.customId.slice(PREFIX.length);
  const meta = { actorId: interaction.user.id, action: `invites_panel_${action}` };

  if (action === 'home') { state.page = 'overview'; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'create') { state.page = 'create'; state.draft = { channelId: interaction.channelId || null, roleIds: [], maxAge: 2592000, maxUses: 0, temporary: false }; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'links') { state.page = 'links'; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'toggle') { const current = invites.getSection(interaction.guildId); invites.setEnabled(interaction.guildId, !current.enabled, meta); await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'sync') { await interaction.deferUpdate(); await invites.syncGuild(interaction.guild, meta); await interaction.editReply(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'health') { const health = await invites.buildHealth(interaction.guild); await interaction.reply({ content: health.healthy ? '✅ Invite Studio is healthy.' : `⚠️ ${health.issues.length} issue(s), ${health.warnings.length} warning(s).`, flags: MessageFlags.Ephemeral }); return true; }
  if (action === 'repair') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const health = await invites.repair(interaction.guild, meta); await interaction.editReply(health.healthy ? '✅ Repair completed and Invite Studio is healthy.' : '⚠️ Repair completed, but issues remain.'); return true; }
  if (action === 'draft-channel' && interaction.isChannelSelectMenu()) { state.draft.channelId = interaction.values[0]; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'draft-expiry' && interaction.isStringSelectMenu()) { state.draft.maxAge = Number(interaction.values[0]); await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'draft-uses' && interaction.isStringSelectMenu()) { state.draft.maxUses = Number(interaction.values[0]); await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'draft-roles' && interaction.isRoleSelectMenu()) { state.draft.roleIds = interaction.values; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'draft-temporary') { state.draft.temporary = !state.draft.temporary; await interaction.update(buildInviteStudioPayload(interaction)); return true; }
  if (action === 'generate') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await invites.createInviteLink(interaction.guild, state.draft, meta);
    state.page = 'links';
    await interaction.editReply(`✅ Invite created: ${result.invite.url}${result.record.roleIds.length ? `\nRoles: ${result.record.roleIds.map((id) => `<@&${id}>`).join(', ')}` : ''}`);
    return true;
  }
  if (action === 'delete') {
    const links = invites.listInviteLinks(interaction.guildId);
    const modal = new ModalBuilder().setCustomId('invites:delete-modal').setTitle('Delete invite link').addComponents(row(new TextInputBuilder().setCustomId('code').setLabel('Invite code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(links[0]?.code || 'abc123')));
    await interaction.showModal(modal); return true;
  }
  if (action === 'delete-modal' && interaction.isModalSubmit()) {
    const code = interaction.fields.getTextInputValue('code').trim();
    await invites.deleteInviteLink(interaction.guild, code, meta);
    state.page = 'links';
    await interaction.reply({ content: `✅ Invite ${code} deleted.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}

module.exports = { buildInviteStudioPayload, handleInviteStudioInteraction };
