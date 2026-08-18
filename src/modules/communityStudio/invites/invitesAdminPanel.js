'use strict';
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { updateModuleSection } = require('../../../core/guild/moduleSectionManager');
const { isModuleEnabled, setModuleEnabled } = require('../../../core/guild/guildManager');
const invites = require('./invites');
const panel = require('./invitesPanel');
const tracking = require('./invitesTracking');
const meta = (interaction, action) => ({ actorId: interaction.user.id, action });
const updateRaw = (guildId, updater, audit = {}) => updateModuleSection(guildId, invites.SECTION, updater, invites.defaults(), audit);
const resetLeaderboard = (guildId, audit = {}) => updateRaw(guildId, (current = {}) => ({ ...current, inviters: {}, members: {} }), audit);
const resetMemberScore = (guildId, userId, audit = {}) => updateRaw(guildId, (current = {}) => { const inviters = { ...(current.inviters || {}) }; delete inviters[userId]; const members = {}; for (const [id, record] of Object.entries(current.members || {})) members[id] = record?.inviterId === userId ? { ...record, inviterId: null, attribution: 'reset' } : record; return { ...current, inviters, members }; }, audit);
const nested = (interaction, key, patch) => { const section = invites.getSection(interaction.guildId); return invites.updateSettings(interaction.guildId, { [key]: { ...section.settings[key], ...patch } }, meta(interaction, `invite_${key}_update`)); };
async function update(interaction) { const payload = panel.buildInviteStudioPayload(interaction); if (interaction.deferred || interaction.replied) await interaction.editReply(payload); else await interaction.update(payload); }
async function resend(interaction, record) { const member = await interaction.guild.members.fetch(record.inviterId).catch(() => null); const live = await interaction.guild.invites.fetch(record.code).catch(() => null); if (!member?.user || !live) throw new Error('The selected personal link or member is unavailable.'); await member.user.send(panel.personalInvitePayload({ ...interaction, user: member.user }, { invite: live, record })); return live.url; }
async function handleInviteStudioInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('invites:')) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ Manage Server permission is required.', flags: MessageFlags.Ephemeral }); return true; }
  const state = panel.sessionFor(interaction);
  const pages = { 'invites:home': 'overview', 'invites:official-settings': 'official-settings', 'invites:public-config': 'public-config', 'invites:member-settings': 'member-settings', 'invites:admin-config': 'admin-config', 'invites:invite-manager': 'invite-manager' };
  if (pages[id]) {
  state.page = pages[id];
  await update(interaction);
  return true;
}

if (id.startsWith('invites:member-')) return handleMemberInteraction(interaction);
  if (id === 'invites:official-channel' && interaction.isChannelSelectMenu()) { nested(interaction, 'officialInvite', { channelId: interaction.values[0] }); await update(interaction); return true; }
  if (id === 'invites:official-roles' && interaction.isRoleSelectMenu()) { nested(interaction, 'officialInvite', { roleIds: interaction.values }); await update(interaction); return true; }
  if (id === 'invites:official-create') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const result = await invites.ensureOfficialInvite(interaction.guild, meta(interaction, 'invite_official_create')); await interaction.editReply(`✅ Official invite ready: ${result.invite.url}`); return true; }
  if (id === 'invites:official-delete') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const config = invites.getSection(interaction.guildId).settings.officialInvite; await invites.deleteInviteLink(interaction.guild, config.code, meta(interaction, 'invite_official_delete')); nested(interaction, 'officialInvite', { code: null }); await interaction.editReply('✅ Official invite deleted.'); return true; }
  if (id === 'invites:panel-channel' && interaction.isChannelSelectMenu()) { tracking.savePanelConfig(interaction.guildId, { channelId: interaction.values[0] }, meta(interaction, 'invite_panel_channel')); await update(interaction); return true; }
  if (id === 'invites:panel-limit' && interaction.isStringSelectMenu()) { tracking.savePanelConfig(interaction.guildId, { leaderboardLimit: Number(interaction.values[0]) }, meta(interaction, 'invite_panel_limit')); await update(interaction); return true; }
  if (id === 'invites:panel-deploy') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const message = await tracking.deployPublicPanel(interaction.guild, meta(interaction, 'invite_panel_deploy')); await interaction.editReply(`✅ Panel ready in <#${message.channelId}>.`); return true; }
  if (id === 'invites:panel-embed-modal') { await interaction.showModal(panel.embedModal(interaction)); return true; }
  if (id === 'invites:panel-embed-submit' && interaction.isModalSubmit()) { tracking.savePanelConfig(interaction.guildId, { title: interaction.fields.getTextInputValue('title'), description: interaction.fields.getTextInputValue('description'), footer: interaction.fields.getTextInputValue('footer'), color: interaction.fields.getTextInputValue('color') }, meta(interaction, 'invite_panel_text')); await interaction.reply({ content: '✅ Panel text saved.', flags: MessageFlags.Ephemeral }); await tracking.refreshPublicPanel(interaction.guild).catch(() => null); return true; }
  if (id === 'invites:member-channel' && interaction.isChannelSelectMenu()) { nested(interaction, 'memberInviteTemplate', { channelId: interaction.values[0] }); await update(interaction); return true; }
  if (id === 'invites:member-roles' && interaction.isRoleSelectMenu()) { nested(interaction, 'memberInviteTemplate', { roleIds: interaction.values }); await update(interaction); return true; }
  if (id === 'invites:member-enabled') { const config = invites.getSection(interaction.guildId).settings.memberInviteTemplate; nested(interaction, 'memberInviteTemplate', { enabled: !config.enabled }); await update(interaction); return true; }
  if (id === 'invites:member-dm-modal') { await interaction.showModal(panel.dmModal(interaction)); return true; }
  if (id === 'invites:member-dm-submit' && interaction.isModalSubmit()) { nested(interaction, 'memberInviteTemplate', { dmTitle: interaction.fields.getTextInputValue('title'), dmMessage: interaction.fields.getTextInputValue('message') }); await interaction.reply({ content: '✅ Member DM saved.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:toggle') {
    const enabling = !isModuleEnabled(interaction.guildId, 'invites');
    setModuleEnabled(interaction.guildId, 'invites', enabling, interaction.guild);
    if (enabling) {
      await invites.syncGuild(interaction.guild, meta(interaction, 'invite_enable_sync')).catch((error) => {
        console.warn(`[Invites] Enable sync failed for guild ${interaction.guildId}: ${error.message || error}`);
      });
    }
    await update(interaction);
    return true;
  }
  if (id === 'invites:health') { const health = await invites.buildHealth(interaction.guild); await interaction.reply({ content: health.healthy ? '✅ Invite Studio is healthy.' : `❌ ${health.issues.map((issue) => issue.code).join(', ')}`, flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:repair') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); const health = await invites.repair(interaction.guild, meta(interaction, 'invite_repair')); await interaction.editReply(health.healthy ? '✅ Repair completed.' : '⚠️ Repair completed with remaining issues.'); return true; }
  if (id === 'invites:default-panel') { const defaults = invites.defaults().settings; const current = invites.getSection(interaction.guildId).settings; invites.updateSettings(interaction.guildId, { publicPanel: { ...current.publicPanel, ...defaults.publicPanel }, memberInviteTemplate: { ...current.memberInviteTemplate, ...defaults.memberInviteTemplate } }, meta(interaction, 'invite_defaults')); await interaction.reply({ content: '✅ Defaults restored.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:leaderboard-reset-arm') { state.resetConfirmUntil = Date.now() + 30000; await update(interaction); return true; }
  if (id === 'invites:leaderboard-reset-confirm') { if (state.resetConfirmUntil < Date.now()) { await interaction.reply({ content: '❌ Reset confirmation expired.', flags: MessageFlags.Ephemeral }); return true; } resetLeaderboard(interaction.guildId, meta(interaction, 'invite_leaderboard_reset')); state.resetConfirmUntil = 0; await interaction.reply({ content: '✅ Leaderboard reset. Personal links were kept.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:manager-display' && interaction.isStringSelectMenu()) { state.displayLimit = Number(interaction.values[0]); await update(interaction); return true; }
  if (id === 'invites:manager-select-member' && interaction.isUserSelectMenu()) { state.selectedUserId = interaction.values[0]; await update(interaction); return true; }
  const selected = invites.findPersonalInvite(interaction.guildId, state.selectedUserId);
  if (id.startsWith('invites:manager-') && !selected) { await interaction.reply({ content: '❌ Select a member with a personal invite first.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:manager-verify') { const live = await interaction.guild.invites.fetch(selected.code).catch(() => null); await interaction.reply({ content: live ? `✅ Verified: ${live.url}` : '❌ Link is missing.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:manager-resend') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); await interaction.editReply(`✅ Resent: ${await resend(interaction, selected)}`); return true; }
  if (id === 'invites:manager-delete') { await invites.deletePersonalInvite(interaction.guild, selected.inviterId, meta(interaction, 'invite_manager_delete')); state.selectedUserId = null; await interaction.reply({ content: '✅ Personal link deleted.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:manager-reset-member') { resetMemberScore(interaction.guildId, selected.inviterId, meta(interaction, 'invite_member_reset')); await interaction.reply({ content: '✅ Member score reset.', flags: MessageFlags.Ephemeral }); return true; }
  return false;
}
async function handleMemberInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('invites:member-')) return false;
  if (!isModuleEnabled(interaction.guildId, 'invites')) { await interaction.reply({ content: '❌ Invite Studio is disabled.', flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:member-profile') { await interaction.reply(panel.profilePayload(interaction.guild, interaction.user)); return true; }
  if (id === 'invites:member-configure') { if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: '❌ Manage Server permission is required.', flags: MessageFlags.Ephemeral }); return true; } await interaction.reply({ ...panel.buildInviteStudioPayload(interaction, 'configure'), flags: MessageFlags.Ephemeral }); return true; }
  if (id === 'invites:member-refresh') { await interaction.reply({ content: '🔄 Updating leaderboard…', flags: MessageFlags.Ephemeral }); const ok = await tracking.refreshPublicPanel(interaction.guild, { action: 'member_refresh' }); await interaction.editReply(ok ? '✅ Leaderboard updated.' : '❌ Panel not found.'); return true; }
  if (id === 'invites:member-personal') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); try { const result = await invites.createPersonalInvite(interaction.guild, interaction.user.id, null, meta(interaction, 'member_personal_invite')); let sent = true; try { await interaction.user.send(panel.personalInvitePayload(interaction, result)); } catch { sent = false; } await interaction.editReply({ ...panel.personalInvitePayload(interaction, result), content: sent ? '✅ Your personal link was sent to your DMs.' : '⚠️ I could not DM you; your private link is shown below.' }); } catch (error) { await interaction.editReply(`❌ ${String(error.message || error).slice(0, 1800)}`); } return true; }
  return false;
}
module.exports = { buildInviteStudioPayload: panel.buildInviteStudioPayload, handleInviteStudioInteraction, handleMemberInteraction };