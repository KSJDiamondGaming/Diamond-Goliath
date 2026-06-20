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

function getBotMember(guild) {
  return guild?.members?.me || guild?.members?.cache?.get(guild.client.user.id) || null;
}

function canBotManageMember(member) {
  const botMember = getBotMember(member?.guild);

  if (!botMember || !member) return false;
  if (member.id === botMember.id) return false;
  if (member.guild?.ownerId === member.id) return false;

  return botMember.roles.highest.position > member.roles.highest.position;
}

function canBotManageRole(guild, role) {
  const botMember = getBotMember(guild);

  if (!botMember || !role) return false;
  if (role.managed || role.id === guild.id) return false;

  return Boolean(
    botMember.permissions.has(PermissionFlagsBits.ManageRoles) &&
      botMember.roles.highest.position > role.position
  );
}

function buildVerifyCustomId(panelId) {
  return `${CUSTOM_ID_PREFIX}:button:${panelId}`;
}

function parseVerifyCustomId(customId = '') {
  const [prefix, action, panelId] = String(customId || '').split(':');

  if (prefix !== CUSTOM_ID_PREFIX || action !== 'button' || !panelId) {
    return null;
  }

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

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;

  return (
    guild.roles.cache.get(roleId) ||
    guild.roles.fetch(roleId).catch(() => null)
  );
}

function toggleVerification(guildId, meta = {}) {
  const section = verificationStore.getVerificationSection(guildId);

  return verificationStore.updateVerificationSection(
    guildId,
    (current) => ({
      ...current,
      enabled: section.enabled !== true,
      updatedAt: new Date().toISOString(),
    }),
    {
      action: 'verification_toggle',
      ...meta,
    }
  );
}

function getVerificationStatus(guildId) {
  return verificationStore.getVerificationSection(guildId);
}

function updateVerificationSettings(guildId, settings = {}, meta = {}) {
  return verificationStore.updateVerificationSection(
    guildId,
    (section) => ({
      ...section,
      settings: {
        ...(section.settings || {}),
        ...settings,
      },
      updatedAt: new Date().toISOString(),
    }),
    {
      action: 'verification_settings_update',
      ...meta,
    }
  );
}

function resolveRoleActionStatus(guild, member, role, action) {
  if (!role) return { ok: true, skipped: true };

  if (action === 'add' && member.roles.cache.has(role.id)) {
    return { ok: true, skipped: true };
  }

  if (action === 'remove' && !member.roles.cache.has(role.id)) {
    return { ok: true, skipped: true };
  }

  if (!canBotManageRole(guild, role)) {
    return {
      ok: false,
      message: `I cannot manage the ${role.name} role. Move my role above it and make sure I have Manage Roles.`,
    };
  }

  return { ok: true, skipped: false };
}

async function verifyMember(interaction) {
  const guild = interaction?.guild;
  const guildId = interaction?.guildId || guild?.id;

  if (!guildId || !guild) {
    return { ok: false, message: 'Server unavailable.' };
  }

  if (!isModuleEnabled(guildId, 'verification')) {
    return { ok: false, message: 'Verification is disabled.' };
  }

  const section = verificationStore.getVerificationSection(guildId);

  if (section.enabled !== true) {
    return { ok: false, message: 'Verification is disabled.' };
  }

  const member =
    interaction.member ||
    (await guild.members.fetch(interaction.user.id).catch(() => null));

  if (!member) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: 'Member not found.' };
  }

  if (!canBotManageMember(member)) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: 'I cannot manage your member roles in this server.' };
  }

  const verifiedRole = await fetchRole(guild, section.settings?.verifiedRoleId);
  const unverifiedRole = await fetchRole(guild, section.settings?.unverifiedRoleId);

  const verifiedRoleStatus = resolveRoleActionStatus(guild, member, verifiedRole, 'add');
  if (!verifiedRoleStatus.ok) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: verifiedRoleStatus.message };
  }

  const unverifiedRoleStatus = resolveRoleActionStatus(guild, member, unverifiedRole, 'remove');
  if (!unverifiedRoleStatus.ok) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: unverifiedRoleStatus.message };
  }

  try {
    if (verifiedRole && !verifiedRoleStatus.skipped) {
      await member.roles.add(verifiedRole, 'Goliath verification completed');
    }

    if (unverifiedRole && !unverifiedRoleStatus.skipped) {
      await member.roles.remove(unverifiedRole, 'Goliath verification completed');
    }

    verificationStore.incrementAnalytics(guildId, { verified: 1 });

    if (section.settings?.dmOnVerify !== false) {
      await interaction.user
        .send(`✅ You are now verified in **${guild.name}**.`)
        .catch(() => null);
    }

    return { ok: true, message: 'Verification complete.' };
  } catch (error) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });

    return {
      ok: false,
      message: error.message || 'Verification failed.',
    };
  }
}

function configureVerification(guildId, input = {}, meta = {}) {
  const settingsInput = input.settings && typeof input.settings === 'object' ? input.settings : {};

  return verificationStore.updateVerificationSection(guildId, (section) => ({
    ...section,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : section.enabled,
    settings: {
      ...(section.settings || {}),
      ...settingsInput,
      verifiedRoleId: cleanDiscordId(settingsInput.verifiedRoleId ?? section.settings?.verifiedRoleId),
      unverifiedRoleId: cleanDiscordId(settingsInput.unverifiedRoleId ?? section.settings?.unverifiedRoleId),
      logChannelId: cleanDiscordId(settingsInput.logChannelId ?? section.settings?.logChannelId),
      dmOnVerify: typeof settingsInput.dmOnVerify === 'boolean'
        ? settingsInput.dmOnVerify
        : section.settings?.dmOnVerify !== false,
      requireButton: typeof settingsInput.requireButton === 'boolean'
        ? settingsInput.requireButton
        : section.settings?.requireButton !== false,
    },
    updatedAt: new Date().toISOString(),
  }), meta);
}

function setVerificationEnabled(guildId, enabled = true, meta = {}) {
  return configureVerification(guildId, { enabled: enabled === true }, meta);
}

async function deployVerificationPanel(channel, input = {}, meta = {}) {
  if (!channel?.guild?.id || !channel?.send) {
    throw new Error('A sendable channel is required.');
  }

  if (!isModuleEnabled(channel.guild.id, 'verification')) {
    throw new Error('Verification module is disabled.');
  }

  const panel = verificationStore.savePanel(
    channel.guild.id,
    {
      title: input.title,
      description: input.description,
      buttonLabel: input.buttonLabel,
      channelId: channel.id,
      createdBy: input.createdBy,
    },
    meta
  );

  const message = await channel.send({
    embeds: [buildVerificationEmbed(panel)],
    components: buildVerificationRows(panel),
  });

  return verificationStore.savePanel(
    channel.guild.id,
    {
      ...panel,
      channelId: channel.id,
      messageId: message.id,
    },
    meta
  );
}

async function handleVerificationInteraction(interaction) {
  const parsed = parseVerifyCustomId(interaction?.customId);

  if (!parsed || !interaction?.guildId) return false;

  const result = await verifyMember(interaction);

  await interaction
    .reply({
      content: result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
      flags: 64,
    })
    .catch(() => null);

  return true;
}

module.exports = {
  CUSTOM_ID_PREFIX,

  canManageVerification,
  canBotManageRole,
  canBotManageMember,

  buildVerifyCustomId,
  parseVerifyCustomId,

  buildVerificationEmbed,
  buildVerificationRows,

  configureVerification,
  setVerificationEnabled,

  toggleVerification,
  getVerificationStatus,
  updateVerificationSettings,

  deployVerificationPanel,
  verifyMember,
  handleVerificationInteraction,
};