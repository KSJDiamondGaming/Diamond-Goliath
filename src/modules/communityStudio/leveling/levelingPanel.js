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
const button = (customId, label, style = ButtonStyle.Primary, disabled = false) => new ButtonBuilder()
  .setCustomId(customId)
  .setLabel(label)
  .setStyle(style)
  .setDisabled(disabled);
const formatChannel = (id) => id ? `<#${id}>` : '`Not set`';
const formatRoles = (ids = []) => ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None`';

function formatMultiplier(section) {
  const active = leveling.getActiveMultiplier(section.guildId || '', null);
  const multiplier = section.multiplier;
  if (!multiplier?.enabled) return 'No multiplier configured.';
  const sources = multiplier.sourceIds?.length ? multiplier.sourceIds.map((id) => `\`${id}\``).join(', ') : 'All enabled sources';
  const starts = multiplier.startsAt ? `<t:${Math.floor(new Date(multiplier.startsAt).getTime() / 1000)}:f>` : 'Immediately';
  const ends = multiplier.endsAt ? `<t:${Math.floor(new Date(multiplier.endsAt).getTime() / 1000)}:R>` : 'No end time';
  return `${active ? '🟢 Active' : '🟡 Scheduled / expired'} · **${multiplier.value}×**\n${multiplier.name || 'XP Multiplier'}\nApplies to: ${sources}\nStarts: ${starts}\nEnds: ${ends}`;
}

function buildLeaderboard(guildId, limit = 10) {
  const top = leveling.getLeaderboard(guildId, limit, { includePaused: true });
  return top.length
    ? top.map((user, index) => `**${index + 1}.** <@${user.userId}> — Level \`${user.level}\` · XP \`${user.xp}\`${user.participating === false ? ' · Paused' : ''}`).join('\n')
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

function sourceLine(id, source) {
  const timing = id === 'message'
    ? ` · Cooldown: ${source.cooldownSeconds}s`
    : id === 'voice'
      ? ` · Every ${source.intervalMinutes}m`
      : '';
  const amount = source.amount > 0 ? `${source.amount} XP` : 'Variable XP';
  return `${source.enabled ? '✅' : '❌'} **${source.label}** — ${amount}${timing}`;
}

function rewardLines(section) {
  if (!section.levelRewards.length) return '`No level reward roles configured.`';
  return section.levelRewards
    .slice(0, 15)
    .map((reward) => `Level **${reward.level}** → <@&${reward.roleId}>${reward.label ? ` · ${reward.label}` : ''}`)
    .join('\n');
}

function buildLevelingPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  section.guildId = guild.id;
  const enabled = isModuleEnabled(guild.id, 'leveling');
  const activeUsers = Object.values(section.users || {});
  const pausedUsers = Object.values(section.pausedUsers || {});
  const activeMultiplier = leveling.getActiveMultiplier(guild.id, null);
  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57f287 : 0x5865f2)
    .setTitle('🏆 Leveling')
    .setDescription([
      'Configure XP sources, multipliers, rank rewards and giveaway-ready leaderboards.',
      '',
      `**Status:** ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Announce Channel:** ${formatChannel(section.announceChannelId)}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds)}`,
      `**Remove Previous Rank Roles:** ${section.removePreviousLevelRoles ? 'Yes ✅' : 'No ❌'}`,
      `**Level Up Announcements:** ${section.announceLevelUps !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      '',
      '**XP Sources**',
      ...Object.entries(section.xpSources).map(([id, source]) => sourceLine(id, source)),
      '',
      '**XP Multiplier**',
      activeMultiplier
        ? `🟢 **${activeMultiplier.name || 'Active Multiplier'}** · ${activeMultiplier.value}×`
        : formatMultiplier(section),
      '',
      '**Level Reward Roles**',
      rewardLines(section),
      '',
      `Active Users: \`${activeUsers.length}\` | Paused Users: \`${pausedUsers.length}\` | XP Awarded: \`${section.analytics.xpAwarded}\` | Level Ups: \`${section.analytics.levelUps}\``,
      '',
      '**Leaderboard**',
      buildLeaderboard(guild.id, 10),
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
        .setPlaceholder('Level reward roles in ascending level order')
        .setMinValues(0)
        .setMaxValues(10)),
      row(
        button(enabled ? 'admin:leveling:disable' : 'admin:leveling:enable', enabled ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:leveling:toggleMessages', section.xpSources.message.enabled ? '💬 Messages On' : '💬 Messages Off', ButtonStyle.Secondary),
        button('admin:leveling:toggleVoice', section.xpSources.voice.enabled ? '🔊 Voice On' : '🔊 Voice Off', ButtonStyle.Secondary),
        button('admin:leveling:toggleAnnounce', section.announceLevelUps ? '📣 Announce On' : '📣 Announce Off', ButtonStyle.Secondary),
        button('admin:leveling:toggleRemovePrevious', section.removePreviousLevelRoles ? '🎭 Replace Ranks' : '🎭 Stack Ranks', ButtonStyle.Secondary),
      ),
      row(
        button('admin:leveling:xpDown', '➖ Message XP', ButtonStyle.Secondary),
        button('admin:leveling:xpUp', '➕ Message XP', ButtonStyle.Secondary),
        button('admin:leveling:multiplierToggle', activeMultiplier ? '⏹️ Stop Multiplier' : '⚡ Start 2× / 1h', activeMultiplier ? ButtonStyle.Danger : ButtonStyle.Success),
        button('admin:leveling:leaderboard', '🏆 Leaderboard', ButtonStyle.Primary),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary),
      ),
    ],
  };
}

function buildLeaderboardPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const eligible = leveling.getEligibleUsers(guild.id, { includePaused: false });
  const paused = Object.keys(section.pausedUsers || {}).length;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🏆 Leveling Leaderboard')
    .setDescription([
      'Use this list when planning level-based rewards or giveaway eligibility.',
      '',
      buildLeaderboard(guild.id, 25),
      '',
      `Eligible active users: \`${eligible.length}\``,
      `Paused users excluded by default: \`${paused}\``,
      '',
      'Giveaway filters can use minimum level, minimum XP, top-N and paused-user exclusion through the Leveling API.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary))],
  };
}

module.exports = { buildLevelingPanel, buildLeaderboardPanel, buildLevelUpEmbed };
