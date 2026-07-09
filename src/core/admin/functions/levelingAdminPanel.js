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

const levelingStore = require('../../../modules/leveling/levelingStore');
const levelingManager = require('../../../modules/leveling/levelingManager');

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

function buildLeaderboard(guildId) {
  const top = levelingManager.getLeaderboard(guildId, 5);
  if (!top.length) return '`No XP tracked yet.`';
  return top.map((user, index) => `**${index + 1}.** <@${user.userId}> — Level \`${user.level}\` · XP \`${user.xp}\``).join('\n');
}

function buildLevelingAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = levelingStore.getSection(guild.id);
  const users = Object.values(section.users || {});

  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('🏆 Leveling')
    .setDescription([
      'Configure XP tracking, level-up announcements and reward roles.',
      '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Announce Channel:** ${formatChannel(section.announceChannelId)}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds)}`,
      `**Level Roles:** ${formatRoles(section.levelRoleIds)}`,
      `**Message XP:** ${section.trackMessages !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Voice XP:** ${section.trackVoice !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Level Up Announcements:** ${section.announceLevelUps !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**XP Per Message:** \`${section.xpPerMessage}\``,
      `**Cooldown:** \`${section.cooldownSeconds}\` second(s)`,
      '',
      `Users: \`${users.length}\` | XP Awarded: \`${section.analytics.xpAwarded}\` | Level Ups: \`${section.analytics.levelUps}\``,
      '',
      '**Top Members**',
      buildLeaderboard(guild.id),
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:leveling:announceChannel').setPlaceholder('Level-up announcement channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:leveling:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:leveling:levelRoles').setPlaceholder('Level reward roles').setMinValues(0).setMaxValues(10)),
      row(
        button(section.enabled !== false ? 'admin:leveling:disable' : 'admin:leveling:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:leveling:toggleMessages', '💬 Messages', ButtonStyle.Secondary),
        button('admin:leveling:toggleVoice', '🔊 Voice', ButtonStyle.Secondary),
        button('admin:leveling:toggleAnnounce', '📣 Announce', ButtonStyle.Secondary),
        button('admin:leveling:xpUp', '➕ XP', ButtonStyle.Secondary)
      ),
      row(
        button('admin:leveling:xpDown', '➖ XP', ButtonStyle.Secondary),
        button('admin:leveling:cooldownDown', '➖ Cooldown', ButtonStyle.Secondary),
        button('admin:leveling:cooldownUp', '➕ Cooldown', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

function save(guild, updater) {
  return levelingStore.updateSection(guild.id, updater, guild);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handleLevelingAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:leveling')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:leveling') return safeUpdate(interaction, buildLevelingAdminPanel(interaction.guild, memberDisplayName));

    if (interaction.isChannelSelectMenu?.() && customId === 'admin:leveling:announceChannel') {
      save(interaction.guild, (section) => ({ ...section, announceChannelId: interaction.values?.[0] || null }));
      return safeUpdate(interaction, buildLevelingAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:managerRoles') {
      save(interaction.guild, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildLevelingAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:leveling:levelRoles') {
      save(interaction.guild, (section) => ({ ...section, levelRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildLevelingAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:leveling:enable') save(interaction.guild, (section) => ({ ...section, enabled: true }));
    if (customId === 'admin:leveling:disable') save(interaction.guild, (section) => ({ ...section, enabled: false }));
    if (customId === 'admin:leveling:toggleMessages') save(interaction.guild, (section) => ({ ...section, trackMessages: !section.trackMessages }));
    if (customId === 'admin:leveling:toggleVoice') save(interaction.guild, (section) => ({ ...section, trackVoice: !section.trackVoice }));
    if (customId === 'admin:leveling:toggleAnnounce') save(interaction.guild, (section) => ({ ...section, announceLevelUps: !section.announceLevelUps }));
    if (customId === 'admin:leveling:xpUp') save(interaction.guild, (section) => ({ ...section, xpPerMessage: Math.min(1000, Number(section.xpPerMessage || 10) + 5) }));
    if (customId === 'admin:leveling:xpDown') save(interaction.guild, (section) => ({ ...section, xpPerMessage: Math.max(1, Number(section.xpPerMessage || 10) - 5) }));
    if (customId === 'admin:leveling:cooldownUp') save(interaction.guild, (section) => ({ ...section, cooldownSeconds: Math.min(3600, Number(section.cooldownSeconds || 60) + 15) }));
    if (customId === 'admin:leveling:cooldownDown') save(interaction.guild, (section) => ({ ...section, cooldownSeconds: Math.max(0, Number(section.cooldownSeconds || 60) - 15) }));

    return safeUpdate(interaction, buildLevelingAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Leveling setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildLevelingAdminPanel,
  handleLevelingAdminInteraction,
};
