'use strict';

const {
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} = require('discord.js');
const {
  EMBED_BUTTON_ACTIONS,
  EMBED_ROLE_BUTTON_ACTIONS,
  normalizeEmbedButtonAction,
  parseEmbedButtonActionIndex,
  legacyEmbedButtonActionFromId,
  resolveEmbedButtonDeployment,
  applyEmbedRoleMutation,
} = require('./embedDeployments');
const { canManageRole } = require('../../../core/security/goliathPermissionGuard');
const panel = require('./embedPanel');

const DANGEROUS_ROLE_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ModerateMembers,
];

function resolved(value, interaction) {
  try { return interaction ? panel.replaceVars(String(value || ''), interaction) : String(value || ''); }
  catch { return String(value || ''); }
}

function resolveButton(interaction) { const index = parseEmbedButtonActionIndex(interaction.customId); if (!Number.isInteger(index) || index < 0 || index >= panel.MAX_BUTTONS) return { index, button: null, deployment: null }; const { deployment, buttons } = resolveEmbedButtonDeployment(interaction.guildId, interaction.message?.id); return { index, button: buttons[index] || null, deployment }; }
async function ephemeral(interaction, payload) { const body = typeof payload === 'string' ? { content: payload } : payload; if (interaction.deferred || interaction.replied) return interaction.followUp({ ...body, flags: MessageFlags.Ephemeral }); return interaction.reply({ ...body, flags: MessageFlags.Ephemeral }); }
async function roleIsSafe(roleId, guild) {
  if (!roleId || !guild) return { ok: false, reason: 'Role not found.', role: null };
  const manageable = await canManageRole(guild, roleId);
  if (!manageable.ok) return { ok: false, reason: manageable.message || 'Goliath cannot manage that role.', role: null };
  const role = guild.roles?.cache?.get?.(manageable.roleId) || null;
  if (!role) return { ok: false, reason: 'Role not found.', role: null };
  if (DANGEROUS_ROLE_PERMISSIONS.some((permission) => role.permissions.has(permission))) return { ok: false, reason: 'Self-service buttons cannot manage privileged moderation or administration roles.', role: null };
  return { ok: true, role };
}
async function executeRoleAction(interaction, action, value) {
  const roleId = String(resolved(value, interaction) || '').match(/\d{15,25}/)?.[0] || null;
  if (!roleId) return ephemeral(interaction, '❌ This button does not have a valid role configured.');
  const safe = await roleIsSafe(roleId, interaction.guild);
  if (!safe.ok) return ephemeral(interaction, `❌ ${safe.reason}`);
  const role = safe.role;
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return ephemeral(interaction, '❌ Your server member record could not be loaded.');
  const result = await applyEmbedRoleMutation(member, role, action, interaction.user.tag || interaction.user.id);
  if (result.outcome === 'already-has-role') return ephemeral(interaction, `ℹ️ You already have **${role.name}**.`);
  if (result.outcome === 'missing-role') return ephemeral(interaction, `ℹ️ You do not have **${role.name}**.`);
  return ephemeral(interaction, `${result.outcome === 'removed' ? '✅ Removed' : '✅ Added'} **${role.name}**.`);
}
async function handleButtonAction(interaction) {
  if (!interaction?.isButton?.()) return false;
  const id = String(interaction.customId || '');
  if (!id.startsWith('embed:action:') && !id.startsWith('embed-action:')) return false;
  const { button } = resolveButton(interaction), action = normalizeEmbedButtonAction(button?.action || legacyEmbedButtonActionFromId(id)), value = button?.actionValue ?? button?.value ?? '';
  if (!action || action === 'custom' || action === 'none') { await ephemeral(interaction, 'ℹ️ This button does not have an action configured yet.'); return true; }
  if (action === 'reply' || action === 'message') { await ephemeral(interaction, resolved(value || 'Button pressed.', interaction).slice(0, 2000) || 'Button pressed.'); return true; }
  if (EMBED_ROLE_BUTTON_ACTIONS.has(action)) { await executeRoleAction(interaction, action, value); return true; }
  if (action === 'user-info') { const member = interaction.member; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Your Server Info').setDescription([`**User:** <@${interaction.user.id}>`, `**User ID:** \`${interaction.user.id}\``, `**Joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown'}`, `**Roles:** ${member?.roles?.cache ? Math.max(0, member.roles.cache.size - 1) : 'Unknown'}`].join('\n')); await ephemeral(interaction, { embeds: [embed] }); return true; }
  if (action === 'server-info') { const guild = interaction.guild; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏠 ${guild?.name || 'Server'}`).setDescription([`**Members:** ${guild?.memberCount ?? 'Unknown'}`, `**Server ID:** \`${guild?.id || 'Unknown'}\``, `**Created:** ${guild?.createdTimestamp ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>` : 'Unknown'}`].join('\n')); if (guild?.iconURL?.()) embed.setThumbnail(guild.iconURL({ size: 256 })); await ephemeral(interaction, { embeds: [embed] }); return true; }
  await ephemeral(interaction, `⚠️ The action \`${action}\` is not registered.`); return true;
}

module.exports = {
  handleButtonAction,
  EMBED_BUTTON_ACTIONS,
};
