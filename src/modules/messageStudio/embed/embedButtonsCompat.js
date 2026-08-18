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
} = require('./embedDeployments');
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

function parseRoleId(value) { const raw = String(value || '').replace(/[<@&>]/g, '').trim(); return /^\d{15,25}$/.test(raw) ? raw : null; }
function resolveButton(interaction) { const index = parseEmbedButtonActionIndex(interaction.customId); if (!Number.isInteger(index) || index < 0 || index >= panel.MAX_BUTTONS) return { index, button: null, deployment: null }; const { deployment, buttons } = resolveEmbedButtonDeployment(interaction.guildId, interaction.message?.id); return { index, button: buttons[index] || null, deployment }; }
async function ephemeral(interaction, payload) { const body = typeof payload === 'string' ? { content: payload } : payload; if (interaction.deferred || interaction.replied) return interaction.followUp({ ...body, flags: MessageFlags.Ephemeral }); return interaction.reply({ ...body, flags: MessageFlags.Ephemeral }); }
function roleIsSafe(role, guild) { if (!role || !guild) return { ok: false, reason: 'Role not found.' }; if (role.managed) return { ok: false, reason: 'That role is managed by Discord or another integration.' }; const me = guild.members.me; if (!me || !role.editable || role.position >= me.roles.highest.position) return { ok: false, reason: 'Goliath cannot manage that role.' }; if (DANGEROUS_ROLE_PERMISSIONS.some((permission) => role.permissions.has(permission))) return { ok: false, reason: 'Self-service buttons cannot manage privileged moderation or administration roles.' }; return { ok: true }; }
async function executeRoleAction(interaction, action, value) {
  const roleId = parseRoleId(resolved(value, interaction));
  if (!roleId) return ephemeral(interaction, '❌ This button does not have a valid role configured.');
  const role = interaction.guild?.roles?.cache?.get(roleId) || await interaction.guild?.roles?.fetch?.(roleId).catch(() => null);
  const safe = roleIsSafe(role, interaction.guild);
  if (!safe.ok) return ephemeral(interaction, `❌ ${safe.reason}`);
  const member = interaction.member?.roles?.cache ? interaction.member : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return ephemeral(interaction, '❌ Your server member record could not be loaded.');
  if (action === 'add-role') { if (member.roles.cache.has(roleId)) return ephemeral(interaction, `ℹ️ You already have **${role.name}**.`); await member.roles.add(role, `Embed Studio button used by ${interaction.user.tag || interaction.user.id}`); return ephemeral(interaction, `✅ Added **${role.name}**.`); }
  if (action === 'remove-role') { if (!member.roles.cache.has(roleId)) return ephemeral(interaction, `ℹ️ You do not have **${role.name}**.`); await member.roles.remove(role, `Embed Studio button used by ${interaction.user.tag || interaction.user.id}`); return ephemeral(interaction, `✅ Removed **${role.name}**.`); }
  const hasRole = member.roles.cache.has(roleId);
  if (hasRole) await member.roles.remove(role, `Embed Studio role toggle used by ${interaction.user.tag || interaction.user.id}`); else await member.roles.add(role, `Embed Studio role toggle used by ${interaction.user.tag || interaction.user.id}`);
  return ephemeral(interaction, `${hasRole ? '✅ Removed' : '✅ Added'} **${role.name}**.`);
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

panel.EMBED_BUTTON_ACTIONS = EMBED_BUTTON_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = EMBED_ROLE_BUTTON_ACTIONS;
panel.handleButtonAction = handleButtonAction;
panel.parseButtonActionIndex = parseEmbedButtonActionIndex;
panel.resolveButtonAction = resolveButton;
panel.supportedButtonActions = EMBED_BUTTON_ACTIONS;

module.exports = panel;
