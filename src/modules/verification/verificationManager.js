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
const guildManager = require('../../core/guild/guildManager');
const { isModuleEnabled } = guildManager;
const testDevOverride = require('../../core/dev/testDevOverrideManager');

const CUSTOM_ID_PREFIX = 'verify';
const REQUIREMENTS_MESSAGE =
  'You do not currently meet the requirements to complete verification. If you believe this is an error, please contact a staff member.';

const BUTTON_STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function canManageVerification(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild)
  );
}

function getBotMember(guild) {
  return guild?.members?.me || guild?.members?.cache?.get(guild.client.user.id) || null;
}

function isDevOwnerTestMember(member) {
  return testDevOverride.isDevOwnerHierarchyOverride({
    guild: member?.guild,
    member,
    user: member?.user,
    userId: member?.id,
  });
}

function canBotManageMember(member) {
  const botMember = getBotMember(member?.guild);

  if (!botMember || !member) return false;
  if (member.id === botMember.id) return false;
  if (isDevOwnerTestMember(member)) return true;

  const { isBotOwner } = require('../../core/security/securityCore');
  if (isBotOwner(member.id)) return false;

  return true;
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
  const embed = new EmbedBuilder()
    .setColor(panel.color || '#57f287')
    .setTitle(panel.title || 'Member Verification')
    .setDescription(panel.description || 'Press the button below to complete server onboarding.')
    .setFooter({ text: panel.footer || 'Goliath Verification' })
    .setTimestamp(new Date());

  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);

  return embed;
}

function buildVerificationRows(panel = {}) {
  const button = new ButtonBuilder()
    .setCustomId(buildVerifyCustomId(panel.panelId || panel.id))
    .setLabel(panel.buttonLabel || 'Verify')
    .setStyle(BUTTON_STYLES[panel.buttonStyle] || ButtonStyle.Success);

  if (panel.buttonEmoji) button.setEmoji(panel.buttonEmoji);

  return [new ActionRowBuilder().addComponents(button)];
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanRoleId(value, guildId) {
  const roleId = cleanDiscordId(value);
  if (!roleId || roleId === guildId) return null;
  return roleId;
}

function firstCleanRoleId(values, guildId) {
  if (Array.isArray(values)) {
    for (const value of values) {
      const clean = cleanRoleId(value, guildId);
      if (clean) return clean;
    }
    return null;
  }

  return cleanRoleId(values, guildId);
}

function getAdminVerificationConfig(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.verification;
  return config && typeof config === 'object' ? config : {};
}

function getEffectiveVerificationSection(guildId) {
  const section = verificationStore.getVerificationSection(guildId);
  const adminConfig = getAdminVerificationConfig(guildId);
  const verifiedRoleId = firstCleanRoleId(
    adminConfig.verifiedRoleId || adminConfig.verifiedRoleIds || section.settings?.verifiedRoleId,
    guildId
  );
  const unverifiedRoleId = firstCleanRoleId(
    adminConfig.unverifiedRoleId || adminConfig.pendingRoleId || adminConfig.pendingRoleIds || section.settings?.unverifiedRoleId,
    guildId
  );
  const logChannelId = cleanDiscordId(adminConfig.logChannelId || section.settings?.logChannelId);

  return {
    ...section,
    enabled: typeof adminConfig.enabled === 'boolean' ? adminConfig.enabled : section.enabled,
    settings: {
      ...(section.settings || {}),
      verifiedRoleId,
      unverifiedRoleId,
      logChannelId,
      dmOnVerify: typeof adminConfig.dmOnVerify === 'boolean'
        ? adminConfig.dmOnVerify
        : section.settings?.dmOnVerify !== false,
      requireButton: typeof adminConfig.requireButton === 'boolean'
        ? adminConfig.requireButton
        : section.settings?.requireButton !== false,
      removePendingRole: typeof adminConfig.removePendingRole === 'boolean'
        ? adminConfig.removePendingRole
        : adminConfig.removePendingRole !== false,
      verificationChannelId: cleanDiscordId(adminConfig.verificationChannelId || section.settings?.verificationChannelId),
    },
  };
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;

  return (
    guild.roles.cache.get(roleId) ||
    guild.roles.fetch(roleId).catch(() => null)
  );
}

function toggleVerification(guildId, meta = {}) {
  const section = getEffectiveVerificationSection(guildId);

  return configureVerification(
    guildId,
    { enabled: section.enabled !== true },
    {
      action: 'verification_toggle',
      ...meta,
    }
  );
}

function getVerificationStatus(guildId) {
  return getEffectiveVerificationSection(guildId);
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

function updatePanelTemplate(guildId, template = {}, meta = {}) {
  return verificationStore.updatePanelTemplate(guildId, template, {
    action: 'verification_panel_template_update',
    ...meta,
  });
}

function resolveRoleActionStatus(guild, member, role, action) {
  if (!role || role.id === guild.id) return { ok: true, skipped: true };

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

async function sendVerificationLog(guild, section, content) {
  const channelId = section.settings?.logChannelId;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return;

  await channel.send(content).catch(() => null);
}

async function verifyMember(interaction) {
  const guild = interaction?.guild;
  const guildId = interaction?.guildId || guild?.id;

  if (!guildId || !guild) {
    return { ok: false, message: 'Server unavailable.' };
  }

  const section = getEffectiveVerificationSection(guildId);

  const member =
    interaction.member ||
    (await guild.members.fetch(interaction.user.id).catch(() => null));

  if (!member) {
    verificationStore.incrementAnalytics(guildId, { failed: 1 });
    return { ok: false, message: 'Member not found.' };
  }

  const verifiedRole = await fetchRole(guild, cleanRoleId(section.settings?.verifiedRoleId, guildId));
  const unverifiedRole = await fetchRole(guild, cleanRoleId(section.settings?.unverifiedRoleId, guildId));

  if (verifiedRole && member.roles.cache.has(verifiedRole.id)) {
    verificationStore.incrementAnalytics(guildId, { alreadyVerified: 1 });
    return { ok: true, message: 'You are already verified.' };
  }

  if (section.enabled !== true) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, unavailable: 1 });
    return {
      ok: false,
      message: 'Verification is currently unavailable. Please contact a staff member if you believe this is an error.',
    };
  }

  if (!verifiedRole) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, unavailable: 1 });
    return {
      ok: false,
      message: 'Verification is not fully configured yet. A verified role must be selected in Admin → Modules → Verification.',
    };
  }

  if (!canBotManageMember(member)) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, roleManageFailed: 1 });
    return { ok: false, message: 'I cannot manage your member roles in this server.' };
  }

  if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, requirementBlocked: 1 });
    return {
      ok: false,
      message: REQUIREMENTS_MESSAGE,
    };
  }

  const verifiedRoleStatus = resolveRoleActionStatus(guild, member, verifiedRole, 'add');
  if (!verifiedRoleStatus.ok) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, roleManageFailed: 1 });
    return { ok: false, message: verifiedRoleStatus.message };
  }

  const shouldRemovePending = section.settings?.removePendingRole !== false;
  const unverifiedRoleStatus = shouldRemovePending
    ? resolveRoleActionStatus(guild, member, unverifiedRole, 'remove')
    : { ok: true, skipped: true };
  if (!unverifiedRoleStatus.ok) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, roleManageFailed: 1 });
    return { ok: false, message: unverifiedRoleStatus.message };
  }

  try {
    if (verifiedRole && !verifiedRoleStatus.skipped) {
      await member.roles.add(verifiedRole, 'Goliath verification completed');
    }

    if (shouldRemovePending && unverifiedRole && !unverifiedRoleStatus.skipped) {
      await member.roles.remove(unverifiedRole, 'Goliath verification completed');
    }

    verificationStore.incrementAnalytics(guildId, { verified: 1 });
    await sendVerificationLog(guild, section, `✅ <@${member.id}> completed verification.`);

    if (section.settings?.dmOnVerify !== false) {
      await interaction.user
        .send(`✅ You are now verified in **${guild.name}**.`)
        .catch(() => null);
    }

    return { ok: true, message: 'Verification complete.' };
  } catch (error) {
    verificationStore.incrementAnalytics(guildId, { failed: 1, roleManageFailed: 1 });

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
      verifiedRoleId: cleanRoleId(settingsInput.verifiedRoleId ?? section.settings?.verifiedRoleId, guildId),
      unverifiedRoleId: cleanRoleId(settingsInput.unverifiedRoleId ?? section.settings?.unverifiedRoleId, guildId),
      logChannelId: cleanDiscordId(settingsInput.logChannelId ?? section.settings?.logChannelId),
      dmOnVerify: typeof settingsInput.dmOnVerify === 'boolean'
        ? settingsInput.dmOnVerify
        : section.settings?.dmOnVerify !== false,
      requireButton: typeof settingsInput.requireButton === 'boolean'
        ? settingsInput.requireButton
        : section.settings?.requireButton !== false,
      removePendingRole: typeof settingsInput.removePendingRole === 'boolean'
        ? settingsInput.removePendingRole
        : section.settings?.removePendingRole !== false,
    },
    updatedAt: new Date().toISOString(),
  }), meta);
}

function setVerificationEnabled(guildId, enabled = true, meta = {}) {
  return configureVerification(guildId, { enabled: enabled === true }, meta);
}

async function fetchPanelMessage(guild, panel) {
  const channelId = panel?.channelId;
  const messageId = panel?.messageId;

  if (!guild || !channelId || !messageId) return null;

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.messages?.fetch) return null;

  return channel.messages.fetch(messageId).catch(() => null);
}

async function deployVerificationPanel(channel, input = {}, meta = {}) {
  if (!channel?.guild?.id || !channel?.send) {
    throw new Error('A sendable channel is required.');
  }

  if (!isModuleEnabled(channel.guild.id, 'verification')) {
    throw new Error('Verification module is disabled.');
  }

  const section = getEffectiveVerificationSection(channel.guild.id);
  if (!section.settings?.verifiedRoleId) {
    throw new Error('Choose a verified role before deploying verification.');
  }

  const existingPanel = input.panelId
    ? verificationStore.getPanel(channel.guild.id, input.panelId)
    : null;
  const template = verificationStore.normalizePanelTemplate({
    ...(section.panelTemplate || {}),
    ...(existingPanel || {}),
    ...(input || {}),
  });

  const panel = verificationStore.savePanel(
    channel.guild.id,
    {
      ...(existingPanel || {}),
      ...template,
      panelId: input.panelId || existingPanel?.panelId,
      channelId: channel.id,
      createdBy: input.createdBy || existingPanel?.createdBy,
    },
    meta
  );

  const existingMessage = await fetchPanelMessage(channel.guild, panel);

  if (existingMessage?.editable) {
    const edited = await existingMessage.edit({
      embeds: [buildVerificationEmbed(panel)],
      components: buildVerificationRows(panel),
    });

    return verificationStore.savePanel(
      channel.guild.id,
      {
        ...panel,
        channelId: edited.channelId || channel.id,
        messageId: edited.id,
        lastDeployedAt: new Date().toISOString(),
      },
      meta
    );
  }

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
      lastDeployedAt: new Date().toISOString(),
    },
    meta
  );
}

async function refreshVerificationPanel(guild, panelId, input = {}, meta = {}) {
  if (!guild?.id) throw new Error('Guild is unavailable.');
  const panel = verificationStore.getPanel(guild.id, panelId);
  if (!panel) throw new Error('Verification panel not found.');

  const channelId = input.channelId || panel.channelId;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) throw new Error('Panel channel is unavailable or not sendable.');

  return deployVerificationPanel(channel, {
    ...panel,
    ...input,
    panelId: panel.panelId,
  }, meta);
}

async function deleteVerificationPanel(guild, panelId, meta = {}) {
  const panel = verificationStore.getPanel(guild.id, panelId);
  if (!panel) throw new Error('Verification panel not found.');
  const message = await fetchPanelMessage(guild, panel);
  if (message?.deletable) await message.delete().catch(() => null);
  return verificationStore.deletePanel(guild.id, panelId, meta);
}

async function getPanelHealth(guild, panel) {
  if (!panel) return { ok: false, status: 'Missing panel record' };
  const channel = panel.channelId
    ? guild.channels.cache.get(panel.channelId) || await guild.channels.fetch(panel.channelId).catch(() => null)
    : null;
  if (!channel) return { ok: false, status: 'Missing channel' };
  const message = await fetchPanelMessage(guild, panel);
  if (!message) return { ok: false, status: 'Missing message' };
  return { ok: true, status: 'Healthy' };
}

async function buildHealthReport(guild) {
  const section = getEffectiveVerificationSection(guild.id);
  const verifiedRole = await fetchRole(guild, section.settings?.verifiedRoleId);
  const unverifiedRole = await fetchRole(guild, section.settings?.unverifiedRoleId);
  const panels = Object.values(section.panels || {});
  const panelHealth = [];

  for (const panel of panels) {
    panelHealth.push({ panelId: panel.panelId, ...(await getPanelHealth(guild, panel)) });
  }

  return {
    enabled: section.enabled === true,
    hasVerifiedRole: Boolean(verifiedRole),
    hasPendingRole: Boolean(unverifiedRole),
    hasLogChannel: Boolean(section.settings?.logChannelId),
    panels: panelHealth,
    warnings: [
      section.enabled !== true ? 'Verification is disabled.' : null,
      !verifiedRole ? 'Verified role is missing.' : null,
      panels.length === 0 ? 'No verification panel deployed.' : null,
      ...panelHealth.filter((panel) => !panel.ok).map((panel) => `${panel.panelId}: ${panel.status}`),
    ].filter(Boolean),
  };
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
  updatePanelTemplate,

  deployVerificationPanel,
  refreshVerificationPanel,
  deleteVerificationPanel,
  getPanelHealth,
  buildHealthReport,
  verifyMember,
  handleVerificationInteraction,
};
