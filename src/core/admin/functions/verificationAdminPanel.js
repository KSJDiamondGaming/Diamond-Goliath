'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const verificationManager = require('../../../modules/verification/verificationManager');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function cleanArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function getConfig(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.verification && typeof modules.verification === 'object' ? modules.verification : {};
  return {
    enabled: true,
    verificationChannelId: null,
    logChannelId: null,
    verifiedRoleIds: [],
    pendingRoleIds: [],
    dmOnVerify: true,
    removePendingRole: true,
    ...config,
  };
}

function saveConfig(guild, updater) {
  const current = getConfig(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  guildManager.updateGuildSection(guild.id, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    verification: {
      ...next,
      updatedAt: new Date().toISOString(),
    },
  }), {}, guild);
  return getConfig(guild.id);
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatRoles(ids = []) {
  const list = cleanArray(ids);
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function buildVerificationAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = getConfig(guild.id);
  const status = verificationManager.getVerificationStatus(guild.id);
  const panels = Object.values(status.panels || {});

  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('✅ Verification')
    .setDescription([
      'Configure member verification and deploy the verification button panel.',
      '',
      `**Status:** ${config.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Verification Channel:** ${formatChannel(config.verificationChannelId)}`,
      `**Log Channel:** ${formatChannel(config.logChannelId)}`,
      `**Verified Roles:** ${formatRoles(config.verifiedRoleIds)}`,
      `**Pending Roles:** ${formatRoles(config.pendingRoleIds)}`,
      `**DM On Verify:** ${config.dmOnVerify !== false ? 'Yes ✅' : 'No ❌'}`,
      `**Remove Pending Role:** ${config.removePendingRole !== false ? 'Yes ✅' : 'No ❌'}`,
      '',
      `Panels: \`${panels.length}\` | Verified: \`${status.analytics?.verified || 0}\` | Failed: \`${status.analytics?.failed || 0}\``,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:verification:channel').setPlaceholder('Verification channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new ChannelSelectMenuBuilder().setCustomId('admin:verification:logChannel').setPlaceholder('Log channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:verification:verifiedRoles').setPlaceholder('Verified role(s)').setMinValues(0).setMaxValues(10)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:verification:pendingRoles').setPlaceholder('Pending/unverified role(s)').setMinValues(0).setMaxValues(10)),
      row(
        button('admin:verification:deploy', '🚀 Deploy Panel', ButtonStyle.Success),
        button(config.enabled !== false ? 'admin:verification:disable' : 'admin:verification:enable', config.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:verification:toggleDm', '📩 DM', ButtonStyle.Secondary),
        button('admin:verification:togglePending', '🧹 Pending', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handleVerificationAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:verification')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:verification') return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName));

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      if (customId === 'admin:verification:channel') saveConfig(interaction.guild, { verificationChannelId: value });
      if (customId === 'admin:verification:logChannel') saveConfig(interaction.guild, { logChannelId: value });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.()) {
      if (customId === 'admin:verification:verifiedRoles') saveConfig(interaction.guild, { verifiedRoleIds: cleanArray(interaction.values || []) });
      if (customId === 'admin:verification:pendingRoles') saveConfig(interaction.guild, { pendingRoleIds: cleanArray(interaction.values || []) });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:verification:enable') saveConfig(interaction.guild, { enabled: true });
    if (customId === 'admin:verification:disable') saveConfig(interaction.guild, { enabled: false });
    if (customId === 'admin:verification:toggleDm') saveConfig(interaction.guild, (config) => ({ ...config, dmOnVerify: !config.dmOnVerify }));
    if (customId === 'admin:verification:togglePending') saveConfig(interaction.guild, (config) => ({ ...config, removePendingRole: !config.removePendingRole }));

    if (customId === 'admin:verification:deploy') {
      await interaction.deferUpdate().catch(() => null);
      const config = getConfig(interaction.guild.id);
      if (!config.verificationChannelId) throw new Error('Choose a verification channel first.');
      const channel = interaction.guild.channels.cache.get(config.verificationChannelId) || await interaction.guild.channels.fetch(config.verificationChannelId).catch(() => null);
      if (!channel?.send) throw new Error('Verification channel is not sendable.');
      await verificationManager.deployVerificationPanel(channel, {
        title: 'Member Verification',
        description: 'Press the button below to complete server verification.',
        buttonLabel: 'Verify',
        createdBy: interaction.user.id,
      }, { actorId: interaction.user.id });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName));
    }

    return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Verification setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildVerificationAdminPanel,
  handleVerificationAdminInteraction,
};
