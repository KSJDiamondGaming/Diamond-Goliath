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
const leveling = require('./leveling');
const { isModuleEnabled } = require('../../../core/guild/guildManager');

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (customId, label, style = ButtonStyle.Primary) => new ButtonBuilder()
  .setCustomId(customId)
  .setLabel(label)
  .setStyle(style);
const formatChannel = (id) => id ? `<#${id}>` : '`Not set`';
const formatRoles = (ids = []) => ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None`';

function buildLeaderboard(guildId) {
  const top = leveling.getLeaderboard(guildId, 5);
  return top.length
    ? top.map((user, index) => `**${index + 1}.** <@${user.userId}> — Level \`${user.level}\` · XP \`${user.xp}\``).join('\n')
    : '`No XP tracked yet.`';
}

function buildLevelUpEmbed(member, user) {
  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle('🏆 Level Up!')
    .setDescription(`${member} reached **level ${user.level}**!`)
    .setFooter({ text: 'Goliath Leveling' })
    .setTimestamp();
}

function buildLevelingPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const enabled = isModuleEnabled(guild.id, 'leveling');
  const users = Object.values(section.users || {});
  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : 0x5865f2)
    .setTitle('🏆 Leveling')
    .setDescription([
      'Configure XP tracking, level-up announcements and reward roles.',
      '',
      `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
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
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:leveling:announceChannel')
        .setPlaceholder('Level-up announcement channel')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)),
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:leveling:managerRoles')
        .setPlaceholder('Manager roles')
        .setMinValues(0)
        .setMaxValues(10)),
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:leveling:levelRoles')
        .setPlaceholder('Level reward roles')
        .setMinValues(0)
        .setMaxValues(10)),
      row(
        button(enabled ? 'admin:leveling:disable' : 'admin:leveling:enable', enabled ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:leveling:toggleMessages', '💬 Messages', ButtonStyle.Secondary),
        button('admin:leveling:toggleVoice', '🔊 Voice', ButtonStyle.Secondary),
        button('admin:leveling:toggleAnnounce', '📣 Announce', ButtonStyle.Secondary),
        button('admin:leveling:xpUp', '➕ XP', ButtonStyle.Secondary),
      ),
      row(
        button('admin:leveling:xpDown', '➖ XP', ButtonStyle.Secondary),
        button('admin:leveling:cooldownDown', '➖ Cooldown', ButtonStyle.Secondary),
        button('admin:leveling:cooldownUp', '➕ Cooldown', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary),
      ),
    ],
  };
}

module.exports = { buildLevelingPanel, buildLevelUpEmbed };
