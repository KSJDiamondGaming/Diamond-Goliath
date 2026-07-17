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

const PREFIX = 'admin:invites';
const sessions = new Map();
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label, style = ButtonStyle.Secondary, disabled = false) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

function session(interaction) {
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (!sessions.has(key)) sessions.set(key, { page: 'overview', selectedInviterId: null });
  return sessions.get(key);
}

function buildOverview(guildId) {
  const section = invites.getSection(guildId);
  const board = invites.leaderboard(guildId, 10);
  const embed = new EmbedBuilder()
    .setColor(section.enabled ? 0x57F287 : 0xED4245)
    .setTitle('📨 Invite Studio')
    .setDescription('Track invite attribution, active members, departures, suspicious accounts, rewards and managed invite health.')
    .addFields(
      { name: 'Status', value: section.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Tracked joins', value: String(section.analytics.tracked || 0), inline: true },
      { name: 'Unknown joins', value: String(section.analytics.unknown || 0), inline: true },
      { name: 'Inviters', value: String(Object.keys(section.inviters).length), inline: true },
      { name: 'Reward roles', value: String(section.settings.rewardRoles.length), inline: true },
      { name: 'Managed invite', value: section.settings.managedInviteCode ? `https://discord.gg/${section.settings.managedInviteCode}` : 'Not configured', inline: false },
      { name: 'Leaderboard', value: board.length ? board.map((item, index) => `${index + 1}. <@${item.inviterId}> — **${item.score}** active (${item.total} total)`).join('\n') : 'No tracked inviters yet.', inline: false },
    )
    .setFooter({ text: 'Invite Studio · Discord-native administration' });
  return {
    embeds: [embed],
    components: [
      row(
        button(`${PREFIX}:toggle`, section.enabled ? 'Disable' : 'Enable', section.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        button(`${PREFIX}:sync`, 'Sync Invites', ButtonStyle.Primary),
        button(`${PREFIX}:health`, 'Health', ButtonStyle.Secondary),
        button(`${PREFIX}:repair`, 'Repair', ButtonStyle.Secondary),
      ),
      row(
        button(`${PREFIX}:settings`, 'Settings', ButtonStyle.Primary),
        button(`${PREFIX}:rewards`, 'Rewards', ButtonStyle.Primary),
        button(`${PREFIX}:leaderboard`, 'Leaderboard', ButtonStyle.Secondary),
        button(`${PREFIX}:refresh`, 'Refresh', ButtonStyle.Secondary),
      ),
    ],
  };
}

function buildSettings(guildId) {
  const section = invites.getSection(guildId);
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('⚙️ Invite Settings').addFields(
    { name: 'Tracking', value: section.settings.trackingEnabled ? 'Enabled' : 'Disabled', inline: true },
    { name: 'Remove credit on leave', value: section.settings.removeOnLeave ? 'Yes' : 'No', inline: true },
    { name: 'Ignore bots', value: section.settings.ignoreBots ? 'Yes' : 'No', inline: true },
    { name: 'Auto-repair managed invite', value: section.settings.autoRepair ? 'Yes' : 'No', inline: true },
    { name: 'Managed channel', value: section.settings.managedInviteChannelId ? `<#${section.settings.managedInviteChannelId}>` : 'Not selected', inline: true },
    { name: 'Log channel', value: section.settings.logChannelId ? `<#${section.settings.logChannelId}>` : 'Not selected', inline: true },
  );
  return { embeds: [embed], components: [
    row(new StringSelectMenuBuilder().setCustomId(`${PREFIX}:setting`).setPlaceholder('Toggle a setting').addOptions(
      { label: 'Invite tracking', value: 'trackingEnabled' },
      { label: 'Remove credit when member leaves', value: 'removeOnLeave' },
      { label: 'Ignore bot joins', value: 'ignoreBots' },
      { label: 'Auto-repair managed invite', value: 'autoRepair' },
    )),
    row(new ChannelSelectMenuBuilder().setCustomId(`${PREFIX}:managed-channel`).setPlaceholder('Managed invite channel').addChannelTypes(ChannelType.GuildText)),
    row(new ChannelSelectMenuBuilder().setCustomId(`${PREFIX}:log-channel`).setPlaceholder('Invite log channel').addChannelTypes(ChannelType.GuildText)),
    row(button(`${PREFIX}:managed-create`, section.settings.managedInviteCode ? 'Regenerate Managed Invite' : 'Create Managed Invite', ButtonStyle.Success), button(`${PREFIX}:home`, 'Back', ButtonStyle.Secondary)),
  ] };
}

function buildRewards(guildId) {
  const section = invites.getSection(guildId);
  const text = section.settings.rewardRoles.length
    ? section.settings.rewardRoles.map((reward) => `<@&${reward.roleId}> at **${reward.invites}** active invites`).join('\n')
    : 'No reward milestones configured.';
  return { embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('🏆 Invite Rewards').setDescription(text)], components: [
    row(new RoleSelectMenuBuilder().setCustomId(`${PREFIX}:reward-role`).setPlaceholder('Select reward role')),
    row(button(`${PREFIX}:reward-remove`, 'Remove Reward', ButtonStyle.Danger, !section.settings.rewardRoles.length), button(`${PREFIX}:home`, 'Back', ButtonStyle.Secondary)),
  ] };
}

function buildLeaderboard(guildId) {
  const board = invites.leaderboard(guildId, 25);
  return { embeds: [new EmbedBuilder().setColor(0xEB459E).setTitle('📊 Invite Leaderboard').setDescription(board.length ? board.map((item, i) => `${i + 1}. <@${item.inviterId}> — **${item.score}** active · ${item.left} left · ${item.fake} flagged`).join('\n') : 'No data yet.')], components: [row(button(`${PREFIX}:home`, 'Back', ButtonStyle.Secondary), button(`${PREFIX}:refresh`, 'Refresh', ButtonStyle.Primary))] };
}

function buildPanel(interaction) {
  const state = session(interaction);
  if (state.page === 'settings') return buildSettings(interaction.guildId);
  if (state.page === 'rewards') return buildRewards(interaction.guildId);
  if (state.page === 'leaderboard') return buildLeaderboard(interaction.guildId);
  return buildOverview(interaction.guildId);
}

async function handleInteraction(interaction) {
  if (!String(interaction.customId || '').startsWith(PREFIX)) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error('Manage Server permission is required.');
  const state = session(interaction);
  const action = interaction.customId.slice(PREFIX.length + 1);
  if (action === 'home') { state.page = 'overview'; await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'settings') { state.page = 'settings'; await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'rewards') { state.page = 'rewards'; await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'leaderboard') { state.page = 'leaderboard'; await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'refresh') { await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'toggle') { const current = invites.getSection(interaction.guildId); invites.setEnabled(interaction.guildId, !current.enabled, { actorId: interaction.user.id, action: 'invites_toggle' }); await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'sync') { await interaction.deferUpdate(); await invites.syncGuild(interaction.guild, { actorId: interaction.user.id, action: 'invites_sync' }); await interaction.editReply(buildPanel(interaction)); return true; }
  if (action === 'health') { const health = await invites.buildHealth(interaction.guild); await interaction.reply({ content: health.healthy ? '✅ Invite Studio is healthy.' : `⚠️ ${health.issues.length} issue(s), ${health.warnings.length} warning(s).`, flags: MessageFlags.Ephemeral }); return true; }
  if (action === 'repair') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const health = await invites.repair(interaction.guild, { actorId: interaction.user.id, action: 'invites_repair' }); await interaction.editReply(health.healthy ? '✅ Invite Studio repaired and healthy.' : '⚠️ Repair completed, but issues remain.'); return true; }
  if (action === 'setting' && interaction.isStringSelectMenu()) { const key = interaction.values[0]; const current = invites.getSection(interaction.guildId); invites.updateSettings(interaction.guildId, { [key]: !current.settings[key] }, { actorId: interaction.user.id, action: 'invites_setting' }); await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'managed-channel' && interaction.isChannelSelectMenu()) { invites.updateSettings(interaction.guildId, { managedInviteChannelId: interaction.values[0] }, { actorId: interaction.user.id, action: 'invites_managed_channel' }); await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'log-channel' && interaction.isChannelSelectMenu()) { invites.updateSettings(interaction.guildId, { logChannelId: interaction.values[0] }, { actorId: interaction.user.id, action: 'invites_log_channel' }); await interaction.update(buildPanel(interaction)); return true; }
  if (action === 'managed-create') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const current = invites.getSection(interaction.guildId); const existing = current.settings.managedInviteCode ? await interaction.guild.invites.fetch(current.settings.managedInviteCode).catch(() => null) : null; await existing?.delete('Goliath managed invite regenerated').catch(() => null); const invite = await invites.createManagedInvite(interaction.guild, current.settings.managedInviteChannelId, { actorId: interaction.user.id }); await interaction.editReply(`✅ Managed invite ready: ${invite.url}`); return true; }
  if (action === 'reward-role' && interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`${PREFIX}:reward-modal:${roleId}`).setTitle('Invite reward milestone');
    modal.addComponents(row(new TextInputBuilder().setCustomId('invites').setLabel('Required active invites').setStyle(TextInputStyle.Short).setRequired(true).setValue('5')));
    await interaction.showModal(modal); return true;
  }
  if (action.startsWith('reward-modal:') && interaction.isModalSubmit()) {
    const roleId = action.split(':')[1]; const required = Number(interaction.fields.getTextInputValue('invites'));
    const current = invites.getSection(interaction.guildId); const rewardRoles = [...current.settings.rewardRoles.filter((item) => item.roleId !== roleId), { roleId, invites: required }];
    invites.updateSettings(interaction.guildId, { rewardRoles }, { actorId: interaction.user.id, action: 'invites_reward_save' });
    state.page = 'rewards'; await interaction.reply({ ...buildPanel(interaction), flags: MessageFlags.Ephemeral }); return true;
  }
  if (action === 'reward-remove') { const current = invites.getSection(interaction.guildId); invites.updateSettings(interaction.guildId, { rewardRoles: current.settings.rewardRoles.slice(0, -1) }, { actorId: interaction.user.id, action: 'invites_reward_remove' }); await interaction.update(buildPanel(interaction)); return true; }
  return false;
}

module.exports = { PREFIX, buildPanel, handleInteraction, getPanel: (guildId) => ({ id: 'invites', title: 'Invite Studio', config: invites.getSection(guildId) }) };