'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const stickyStore = require('../../../modules/sticky/stickyGuildStore');
const stickyManager = require('../../../modules/sticky/stickyManager');
const guildManager = require('../../guild/guildManager');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function formatChannels(data) {
  const ids = Object.keys(data.channels || {});
  return ids.length ? ids.map((id) => `<#${id}>`).join(', ') : '`None`';
}

function formatRoles(ids = []) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function getConfig(guildId) {
  const data = stickyStore.loadStickyData(guildId);
  return {
    enabled: data.enabled !== false,
    channels: data.channels || {},
    managerRoleIds: Array.isArray(data.managerRoleIds) ? data.managerRoleIds : [],
    defaultContent: data.defaultContent || '📌 Sticky message configured by Goliath.',
    repostEvery: Number(data.repostEvery || 10),
    cooldownSeconds: Number(data.cooldownSeconds ?? 60),
    cleanupPrevious: data.cleanupPrevious !== false,
    allowEmbeds: data.allowEmbeds !== false,
    mode: data.mode || 'per-channel',
  };
}

function saveConfig(guild, updater) {
  const current = getConfig(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  const existing = stickyStore.loadStickyData(guild.id);
  const saved = stickyStore.saveStickyData(guild.id, {
    ...existing,
    ...next,
    enabled: next.enabled !== false,
    updatedAt: new Date().toISOString(),
  });
  guildManager.setModuleEnabled(guild.id, 'sticky', next.enabled !== false, guild);
  return saved;
}

function buildStickyAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const config = getConfig(guild.id);
  const active = Object.values(config.channels || {}).filter((sticky) => sticky?.enabled !== false).length;

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x57f287 : 0x5865f2)
    .setTitle('💬 Sticky Messages')
    .setDescription([
      'Configure channels that automatically repost a sticky message after chat activity.',
      '',
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Sticky Channels:** ${formatChannels(config)}`,
      `**Active Stickies:** \`${active}\``,
      `**Manager Roles:** ${formatRoles(config.managerRoleIds)}`,
      `**Repost Every:** \`${config.repostEvery}\` message(s)`,
      `**Cooldown:** \`${config.cooldownSeconds}\` second(s)`,
      `**Embeds:** ${config.allowEmbeds ? 'Enabled ✅' : 'Disabled ❌'}`,
      '',
      '**Default Message**',
      config.defaultContent.slice(0, 1000),
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:sticky:channels')
        .setPlaceholder('Sticky channels')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(10)),
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:sticky:managerRoles')
        .setPlaceholder('Manager roles')
        .setMinValues(0)
        .setMaxValues(10)),
      row(
        button('admin:sticky:message', '✏️ Message', ButtonStyle.Primary),
        button('admin:sticky:refresh', '🔄 Refresh', ButtonStyle.Success),
        button(config.enabled ? 'admin:sticky:disable' : 'admin:sticky:enable', config.enabled ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:sticky:toggleEmbed', '🎨 Embed', ButtonStyle.Secondary)
      ),
      row(
        button('admin:sticky:repostDown', '➖ Repost', ButtonStyle.Secondary),
        button('admin:sticky:repostUp', '➕ Repost', ButtonStyle.Secondary),
        button('admin:sticky:cooldownDown', '➖ Cooldown', ButtonStyle.Secondary),
        button('admin:sticky:cooldownUp', '➕ Cooldown', ButtonStyle.Secondary)
      ),
      row(button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
    ],
  };
}

function buildMessageModal(guildId) {
  const config = getConfig(guildId);
  return new ModalBuilder()
    .setCustomId('admin:sticky:messageModal')
    .setTitle('Sticky Message')
    .addComponents(row(new TextInputBuilder()
      .setCustomId('content')
      .setLabel('Sticky message content')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1800)
      .setValue(config.defaultContent.slice(0, 1800))));
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

function upsertSelectedChannels(guild, channelIds) {
  const config = getConfig(guild.id);
  const channels = {};
  for (const channelId of channelIds || []) {
    channels[channelId] = {
      ...(config.channels[channelId] || {}),
      enabled: true,
      channelId,
      type: config.allowEmbeds ? 'embed' : 'text',
      content: config.defaultContent,
      repostEvery: config.repostEvery,
      cooldownSeconds: config.cooldownSeconds,
      messageCount: 0,
    };
  }
  saveConfig(guild, { channels });
}

async function handleStickyAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:sticky')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:sticky') {
      return safeUpdate(interaction, buildStickyAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:sticky:message') {
      await interaction.showModal(buildMessageModal(interaction.guild.id));
      return true;
    }

    if (interaction.isModalSubmit?.() && customId === 'admin:sticky:messageModal') {
      const content = interaction.fields.getTextInputValue('content');
      saveConfig(interaction.guild, (config) => {
        const channels = { ...(config.channels || {}) };
        for (const channelId of Object.keys(channels)) {
          channels[channelId] = { ...channels[channelId], content };
        }
        return { ...config, defaultContent: content, channels };
      });
      await interaction.reply({ content: '✅ Sticky message updated.', flags: 64 }).catch(() => null);
      return true;
    }

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:sticky:channels') {
      upsertSelectedChannels(interaction.guild, interaction.values || []);
      return safeUpdate(interaction, buildStickyAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:sticky:managerRoles') {
      saveConfig(interaction.guild, { managerRoleIds: [...new Set(interaction.values || [])] });
      return safeUpdate(interaction, buildStickyAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:sticky:enable') saveConfig(interaction.guild, { enabled: true });
    if (customId === 'admin:sticky:disable') saveConfig(interaction.guild, { enabled: false });
    if (customId === 'admin:sticky:toggleEmbed') saveConfig(interaction.guild, (config) => ({ ...config, allowEmbeds: !config.allowEmbeds }));
    if (customId === 'admin:sticky:repostUp') saveConfig(interaction.guild, (config) => ({ ...config, repostEvery: Math.min(100, Number(config.repostEvery || 10) + 1) }));
    if (customId === 'admin:sticky:repostDown') saveConfig(interaction.guild, (config) => ({ ...config, repostEvery: Math.max(1, Number(config.repostEvery || 10) - 1) }));
    if (customId === 'admin:sticky:cooldownUp') saveConfig(interaction.guild, (config) => ({ ...config, cooldownSeconds: Math.min(3600, Number(config.cooldownSeconds || 60) + 15) }));
    if (customId === 'admin:sticky:cooldownDown') saveConfig(interaction.guild, (config) => ({ ...config, cooldownSeconds: Math.max(0, Number(config.cooldownSeconds || 60) - 15) }));

    if (customId === 'admin:sticky:refresh') {
      await interaction.deferUpdate().catch(() => null);
      const config = getConfig(interaction.guild.id);
      for (const channelId of Object.keys(config.channels || {})) {
        const channel = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
        const sticky = stickyStore.getChannelSticky(interaction.guild.id, channelId);
        if (channel?.send && sticky) await stickyManager.repostSticky(channel, sticky, interaction.client, { manual: true, actorId: interaction.user.id }).catch(() => null);
      }
      return safeUpdate(interaction, buildStickyAdminPanel(interaction.guild, memberDisplayName));
    }

    return safeUpdate(interaction, buildStickyAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Sticky setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildStickyAdminPanel,
  handleStickyAdminInteraction,
};
