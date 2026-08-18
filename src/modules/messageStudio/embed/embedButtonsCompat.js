'use strict';

const {
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { getAllEmbedDeployments } = require('./embedDeployments');
const panel = require('./embedPanel');

const BUILT_IN_ACTIONS = Object.freeze(['reply', 'toggle-role', 'add-role', 'remove-role', 'user-info', 'server-info']);
const ROLE_ACTIONS = new Set(['toggle-role', 'add-role', 'remove-role']);
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

function cleanAction(value) { return String(value || '').trim().toLowerCase().replace(/_/g, '-'); }
function parseRoleId(value) { const raw = String(value || '').replace(/[<@&>]/g, '').trim(); return /^\d{15,25}$/.test(raw) ? raw : null; }
function deploymentForMessage(guildId, messageId) { const deployments = Object.values(getAllEmbedDeployments(guildId) || {}); return deployments.find((item) => String(item?.messageId || '') === String(messageId || '')) || null; }
function presetForDeployment(guildId, deployment) { if (!deployment) return null; const presets = typeof guildManager.getEmbedPresets === 'function' ? guildManager.getEmbedPresets(guildId) || {} : {}; return presets[deployment.preset] || presets[deployment.key] || null; }
function buttonsForPreset(preset) { if (!preset || typeof preset !== 'object') return []; if (Array.isArray(preset.buttons) && preset.buttons.length) return preset.buttons; const panels = Array.isArray(preset.panels) ? preset.panels : []; const selectedPanelIndex = Number.isInteger(preset.selectedPanelIndex) ? preset.selectedPanelIndex : null; if (selectedPanelIndex != null && Array.isArray(panels[selectedPanelIndex]?.buttons)) return panels[selectedPanelIndex].buttons; const panelsWithButtons = panels.filter((entry) => Array.isArray(entry?.buttons) && entry.buttons.length); if (panelsWithButtons.length === 1) return panelsWithButtons[0].buttons; if (Array.isArray(panels[0]?.buttons)) return panels[0].buttons; return []; }
function parseButtonIndex(customId) { const id = String(customId || ''); let match = id.match(/^embed:action:(\d+)$/); if (match) return Number(match[1]); match = id.match(/^embed-action:.*:(\d+)$/); return match ? Number(match[1]) : null; }
function legacyActionFromId(customId) { const match = String(customId || '').match(/^embed-action:(.*):(\d+)$/); return match ? cleanAction(match[1]) : ''; }
function resolveButton(interaction) { const index = parseButtonIndex(interaction.customId); if (!Number.isInteger(index) || index < 0 || index >= panel.MAX_BUTTONS) return { index, button: null, deployment: null }; const deployment = deploymentForMessage(interaction.guildId, interaction.message?.id); const preset = presetForDeployment(interaction.guildId, deployment); const buttons = buttonsForPreset(preset); return { index, button: buttons[index] || null, deployment }; }
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
  const { button } = resolveButton(interaction), action = cleanAction(button?.action || legacyActionFromId(id)), value = button?.actionValue ?? button?.value ?? '';
  if (!action || action === 'custom' || action === 'none') { await ephemeral(interaction, 'ℹ️ This button does not have an action configured yet.'); return true; }
  if (action === 'reply' || action === 'message') { await ephemeral(interaction, resolved(value || 'Button pressed.', interaction).slice(0, 2000) || 'Button pressed.'); return true; }
  if (ROLE_ACTIONS.has(action)) { await executeRoleAction(interaction, action, value); return true; }
  if (action === 'user-info') { const member = interaction.member; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('👤 Your Server Info').setDescription([`**User:** <@${interaction.user.id}>`, `**User ID:** \`${interaction.user.id}\``, `**Joined:** ${member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown'}`, `**Roles:** ${member?.roles?.cache ? Math.max(0, member.roles.cache.size - 1) : 'Unknown'}`].join('\n')); await ephemeral(interaction, { embeds: [embed] }); return true; }
  if (action === 'server-info') { const guild = interaction.guild; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🏠 ${guild?.name || 'Server'}`).setDescription([`**Members:** ${guild?.memberCount ?? 'Unknown'}`, `**Server ID:** \`${guild?.id || 'Unknown'}\``, `**Created:** ${guild?.createdTimestamp ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>` : 'Unknown'}`].join('\n')); if (guild?.iconURL?.()) embed.setThumbnail(guild.iconURL({ size: 256 })); await ephemeral(interaction, { embeds: [embed] }); return true; }
  await ephemeral(interaction, `⚠️ The action \`${action}\` is not registered.`); return true;
}

panel.EMBED_BUTTON_ACTIONS = BUILT_IN_ACTIONS;
panel.EMBED_ROLE_BUTTON_ACTIONS = ROLE_ACTIONS;
panel.handleButtonAction = handleButtonAction;
panel.parseButtonActionIndex = parseButtonIndex;
panel.resolveButtonAction = resolveButton;
panel.supportedButtonActions = BUILT_IN_ACTIONS;

module.exports = panel;
