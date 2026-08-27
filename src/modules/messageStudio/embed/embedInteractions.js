'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  TextInputStyle,
} = require('discord.js');
const panel = require('./embedPanel');
const media = require('./embedMedia');
const guildManager = require('../../../core/guild/guildManager');
const {
  validateChannelAccess,
  canManageRole,
} = require('../../../core/systems/security/protection/permissions');
const {
  EMBED_BUTTON_ACTIONS,
  EMBED_ROLE_BUTTON_ACTIONS,
  normalizeEmbedButtonAction,
  parseEmbedButtonActionIndex,
  legacyEmbedButtonActionFromId,
  resolveEmbedButtonDeployment,
  applyEmbedRoleMutation,
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeployments');
const { buildEmbedPayload, prepareEmbedMedia } = require('./embedRenderer');

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

function normalizeInteractionResponseOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options;
  if (options.ephemeral !== true) return options;
  const next = { ...options };
  delete next.ephemeral;
  next.flags = Number(next.flags || 0) | MessageFlags.Ephemeral;
  return next;
}

async function safeReply(interaction, options) {
  const normalized = normalizeInteractionResponseOptions(options);
  if (interaction.replied || interaction.deferred) return interaction.followUp(normalized);
  return interaction.reply(normalized);
}

async function safeDeferReply(interaction, options) {
  if (interaction.replied || interaction.deferred) return false;
  await interaction.deferReply(normalizeInteractionResponseOptions(options));
  return true;
}

async function safeEditReply(interaction, options) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(options);
  return interaction.reply(options);
}

function createModalInput(customId, label, style = TextInputStyle.Short, required = true, value = '') {
  const input = new (require('discord.js').TextInputBuilder)()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
  if (value) input.setValue(String(value).slice(0, style === TextInputStyle.Paragraph ? 4000 : 400));
  return input;
}

function hasDangerousRolePermissions(role) {
  if (!role?.permissions) return false;
  return DANGEROUS_ROLE_PERMISSIONS.some((permission) => role.permissions.has(permission));
}

function getInteractionActor(interaction) {
  return interaction.member || interaction.user || null;
}

function getInteractionGuild(interaction) {
  return interaction.guild || null;
}

function getInteractionChannel(interaction) {
  return interaction.channel || null;
}

function getInteractionGuildId(interaction) {
  return interaction.guildId || interaction.guild?.id || null;
}

function getInteractionChannelId(interaction) {
  return interaction.channelId || interaction.channel?.id || null;
}

function getInteractionUserId(interaction) {
  return interaction.user?.id || interaction.member?.user?.id || interaction.member?.id || null;
}

function getInteractionMessageId(interaction) {
  return interaction.message?.id || null;
}

function parseRoleButtonCustomId(customId) {
  const raw = String(customId || '');
  const match = raw.match(/^embed_role_button:(\d+):(.+)$/);
  if (!match) return null;
  return { index: Number(match[1]), deploymentKey: match[2] };
}

function parseButtonCustomId(customId) {
  const raw = String(customId || '');
  const match = raw.match(/^embed_button:(\d+):(.+)$/);
  if (!match) return null;
  return { index: Number(match[1]), deploymentKey: match[2] };
}

function buildLinkButtons(buttons = []) {
  const rows = [];
  let row = new ActionRowBuilder();
  for (const button of buttons) {
    if (!button?.url || !button?.label) continue;
    if (row.components.length >= 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(String(button.label).slice(0, 80))
        .setURL(String(button.url))
    );
  }
  if (row.components.length) rows.push(row);
  return rows;
}

function getDeploymentFromInteraction(interaction, parsed) {
  const guildId = getInteractionGuildId(interaction);
  const channelId = getInteractionChannelId(interaction);
  const messageId = getInteractionMessageId(interaction);
  if (!guildId || !channelId || !messageId) return null;
  const key = parsed?.deploymentKey || getDeploymentKeyFromState({ guildId, channelId, messageId });
  return getEmbedDeployment(guildId, key) || getEmbedDeployment(guildId, `${channelId}:${messageId}`);
}

async function validateInteractionAccess(interaction, options = {}) {
  const guild = getInteractionGuild(interaction);
  const actor = getInteractionActor(interaction);
  const channel = getInteractionChannel(interaction);
  if (!guild || !actor) return { allowed: false, reason: 'Guild/member context is required.' };
  const channelAccess = validateChannelAccess(actor, channel, options);
  if (!channelAccess.allowed) return channelAccess;
  return { allowed: true };
}

async function handleRoleButton(interaction, parsed) {
  const deployment = getDeploymentFromInteraction(interaction, parsed);
  if (!deployment) return safeReply(interaction, { content: 'This embed deployment is no longer available.', ephemeral: true });
  const button = deployment.buttons?.[parsed.index];
  if (!button) return safeReply(interaction, { content: 'This button is no longer configured.', ephemeral: true });
  const action = normalizeEmbedButtonAction(button.action);
  if (!EMBED_ROLE_BUTTON_ACTIONS.has(action)) return false;

  const guild = getInteractionGuild(interaction);
  const member = interaction.member;
  const role = guild?.roles?.cache?.get(String(button.roleId || ''));
  if (!guild || !member || !role) return safeReply(interaction, { content: 'The configured role could not be found.', ephemeral: true });
  if (hasDangerousRolePermissions(role)) return safeReply(interaction, { content: 'This role cannot be self-managed because it has sensitive permissions.', ephemeral: true });

  const botMember = guild.members.me;
  if (!botMember || !canManageRole(botMember, role)) return safeReply(interaction, { content: 'Goliath cannot manage that role because of Discord role hierarchy.', ephemeral: true });

  const access = await validateInteractionAccess(interaction);
  if (!access.allowed) return safeReply(interaction, { content: access.reason || 'You cannot use this button here.', ephemeral: true });

  await safeDeferReply(interaction, { ephemeral: true });
  try {
    const result = await applyEmbedRoleMutation({ guild, member, role, action });
    return safeEditReply(interaction, { content: result.message || 'Role updated.' });
  } catch (error) {
    console.error('[EmbedRoleButton] Failed:', error);
    return safeEditReply(interaction, { content: 'I could not update that role.' });
  }
}

async function handleEmbedButton(interaction) {
  const parsed = parseRoleButtonCustomId(interaction.customId) || parseButtonCustomId(interaction.customId);
  if (!parsed) return false;
  const deployment = getDeploymentFromInteraction(interaction, parsed);
  if (!deployment) return safeReply(interaction, { content: 'This embed deployment is no longer available.', ephemeral: true });
  const button = deployment.buttons?.[parsed.index];
  if (!button) return safeReply(interaction, { content: 'This button is no longer configured.', ephemeral: true });
  const action = normalizeEmbedButtonAction(button.action);

  if (EMBED_ROLE_BUTTON_ACTIONS.has(action)) return handleRoleButton(interaction, parsed);
  if (action === EMBED_BUTTON_ACTIONS.LINK) return false;
  if (action === EMBED_BUTTON_ACTIONS.COPY_TEXT) {
    return safeReply(interaction, { content: String(button.value || button.text || '').slice(0, 2000), ephemeral: true });
  }
  if (action === EMBED_BUTTON_ACTIONS.REPLY) {
    return safeReply(interaction, { content: String(button.value || button.text || 'Done.').slice(0, 2000), ephemeral: Boolean(button.ephemeral) });
  }
  return false;
}

async function handleEmbedModal(interaction) {
  if (!interaction.customId?.startsWith('embed_')) return false;
  return false;
}

async function deployEmbed(interaction, state, options = {}) {
  const guild = getInteractionGuild(interaction);
  const channelId = options.channelId || state?.channelId || getInteractionChannelId(interaction);
  const channel = guild?.channels?.cache?.get(String(channelId || ''));
  if (!guild || !channel?.isTextBased?.()) throw new Error('A valid text channel is required.');

  const access = validateChannelAccess(getInteractionActor(interaction), channel, { requireSend: true });
  if (!access.allowed) throw new Error(access.reason || 'You cannot deploy embeds to that channel.');

  const prepared = await prepareEmbedMedia(state, { guild, channel });
  const payload = buildEmbedPayload(prepared.state || state, { guild, channel });
  const components = [...(payload.components || []), ...buildLinkButtons(prepared.linkButtons || [])];
  const message = await channel.send({ ...payload, components });
  const deployment = resolveEmbedButtonDeployment({ guildId: guild.id, channelId: channel.id, messageId: message.id, state: prepared.state || state });
  saveEmbedDeployment(guild.id, deployment.key, deployment);
  return { message, deployment };
}

async function handleInteraction(interaction) {
  if (interaction.isButton?.()) return handleEmbedButton(interaction);
  if (interaction.isModalSubmit?.()) return handleEmbedModal(interaction);
  return false;
}

module.exports = {
  handleInteraction,
  handleEmbedButton,
  handleEmbedModal,
  deployEmbed,
  buildLinkButtons,
  createModalInput,
  parseButtonCustomId,
  parseRoleButtonCustomId,
  hasDangerousRolePermissions,
};
