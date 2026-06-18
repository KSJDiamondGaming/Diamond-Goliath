'use strict';

// src/modules/verification/verificationManager.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const verificationStore = require('./verificationStore');
const { isModuleEnabled } = require('../../guild/guildManager');

const CUSTOM_ID_PREFIX = 'verify';

function canManageVerification(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function buildVerifyCustomId(panelId) {
  return `${CUSTOM_ID_PREFIX}:button:${panelId}`;
}

function parseVerifyCustomId(customId = '') {
  const [prefix, action, panelId] = String(customId || '').split(':');
  if (prefix !== CUSTOM_ID_PREFIX || action !== 'button' || !panelId) return null;
  return { panelId };
}

function buildVerificationEmbed(panel = {}) {
  return new EmbedBuilder()
    .setColor('#57f287')
    .setTitle(panel.title || 'Member Verification')
    .setDescription(panel.description || 'Press the button below to complete server onboarding.')
    .setFooter({ text: 'Goliath Verification' })
    .setTimestamp(new Date());
}

function buildVerificationRows(panel = {}) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildVerifyCustomId(panel.panelId || panel.id))
        .setLabel(panel.buttonLabel || 'Verify')
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

async function verifyMember(interaction) {
  const guild = interaction?.guild;
  const guildId = interaction?.guildId || guild?.id;

  if (!guildId || !guild) return { ok: false, message: 'Server unavailable.' };
  if (!isModuleEnabled(guildId, 'verification')) return { ok: false, message: 'Verification is disabled.' };

  const section = verificationStore.getVerificationSection(guildId);
  if (section.enabled !== true) return { ok: false, message: 'Verification is disabled.' };

  const member = interaction.member || await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: 'Member not found.' };
  }

  const verifiedRole = await fetchRole(guild, section.settings?.verifiedRoleId);
  const unverifiedRole = await fetchRole(guild, section.settings?.unverifiedRoleId);

  try {
    if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
      await member.roles.add(verifiedRole, 'Goliath verification completed');
    }

    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      await member.roles.remove(unverifiedRole, 'Goliath verification completed');
    }

    verificationStore.incrementAnalytics(guildId, { verified: 1 });
    return { ok: true, message: 'Verification complete.' };
  } catch (error) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: error.message || 'Verification failed.' };
  }
}

async function deployVerificationPanel(channel, input = {}, meta = {}) {
  if (!channel?.guild?.id || !channel?.send) throw new Error('A sendable channel is required.');
  if (!isModuleEnabled(channel.guild.id, 'verification')) throw new Error('Verification module is disabled.');

  const panel = verificationStore.savePanel(channel.guild.id, {
    title: input.title,
    description: input.description,
    buttonLabel: input.buttonLabel,
    channelId: channel.id,
    createdBy: input.createdBy,
  }, meta);

  const message = await channel.send({
    embeds: [buildVerificationEmbed(panel)],
    components: buildVerificationRows(panel),
  });

  return verificationStore.savePanel(channel.guild.id, {
    ...panel,
    channelId: channel.id,
    messageId: message.id,
  }, meta);
}

async function handleVerificationInteraction(interaction) {
  const parsed = parseVerifyCustomId(interaction?.customId);
  if (!parsed || !interaction?.guildId) return false;

  const result = await verifyMember(interaction);

  await interaction.reply({
    content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
    flags: 64,
  }).catch(() => null);

  return true;
}

module.exports = {
  CUSTOM_ID_PREFIX,
  canManageVerification,
  buildVerifyCustomId,
  parseVerifyCustomId,
  buildVerificationEmbed,
  buildVerificationRows,
  deployVerificationPanel,
  verifyMember,
  handleVerificationInteraction,
};
