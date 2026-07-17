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

const starboardStore = require('../../../modules/starboard/starboardStore');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatRoles(ids = []) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function buildStarboardAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = starboardStore.getStarboardSection(guild.id);
  const posts = Object.values(section.posts || {});

  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('⭐ Starboard')
    .setDescription([
      'Configure highlighted messages powered by reactions.',
      '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Starboard Channel:** ${formatChannel(section.channelId || section.starboardChannelId)}`,
      `**Log Channel:** ${formatChannel(section.logChannelId)}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds)}`,
      `**Emoji:** ${section.emoji || '⭐'}`,
      `**Threshold:** \`${section.threshold || 3}\``,
      `**Self Star:** ${section.allowSelfStar ? 'Allowed ✅' : 'Blocked ❌'}`,
      `**Unique Users:** ${section.requireUniqueUsers !== false ? 'Required ✅' : 'Not Required ❌'}`,
      '',
      `Posts: \`${posts.length}\` | Posted: \`${section.analytics?.posted || 0}\` | Updated: \`${section.analytics?.updated || 0}\``,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:starboard:channel').setPlaceholder('Starboard channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new ChannelSelectMenuBuilder().setCustomId('admin:starboard:logChannel').setPlaceholder('Log channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)
      ),
      row(
        new RoleSelectMenuBuilder().setCustomId('admin:starboard:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)
      ),
      row(
        button(section.enabled !== false ? 'admin:starboard:disable' : 'admin:starboard:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:starboard:thresholdDown', '➖ Threshold', ButtonStyle.Secondary),
        button('admin:starboard:thresholdUp', '➕ Threshold', ButtonStyle.Secondary),
        button('admin:starboard:toggleSelf', '⭐ Self Star', ButtonStyle.Secondary),
        button('admin:starboard:toggleUnique', '👥 Unique', ButtonStyle.Secondary)
      ),
      row(button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
    ],
  };
}

function save(guild, updater) {
  return starboardStore.updateStarboardSection(guild.id, updater, guild);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handleStarboardAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:starboard')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:starboard') {
      return safeUpdate(interaction, buildStarboardAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      const prop = customId.split(':')[2];
      if (prop === 'channel') save(interaction.guild, (section) => ({ ...section, channelId: value, starboardChannelId: value }));
      if (prop === 'logChannel') save(interaction.guild, (section) => ({ ...section, logChannelId: value }));
      return safeUpdate(interaction, buildStarboardAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:starboard:managerRoles') {
      save(interaction.guild, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildStarboardAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:starboard:enable') save(interaction.guild, (section) => ({ ...section, enabled: true }));
    if (customId === 'admin:starboard:disable') save(interaction.guild, (section) => ({ ...section, enabled: false }));
    if (customId === 'admin:starboard:thresholdUp') save(interaction.guild, (section) => ({ ...section, threshold: Math.min(50, Number(section.threshold || 3) + 1) }));
    if (customId === 'admin:starboard:thresholdDown') save(interaction.guild, (section) => ({ ...section, threshold: Math.max(1, Number(section.threshold || 3) - 1) }));
    if (customId === 'admin:starboard:toggleSelf') save(interaction.guild, (section) => ({ ...section, allowSelfStar: !section.allowSelfStar }));
    if (customId === 'admin:starboard:toggleUnique') save(interaction.guild, (section) => ({ ...section, requireUniqueUsers: !section.requireUniqueUsers }));

    return safeUpdate(interaction, buildStarboardAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Starboard setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildStarboardAdminPanel,
  handleStarboardAdminInteraction,
};
