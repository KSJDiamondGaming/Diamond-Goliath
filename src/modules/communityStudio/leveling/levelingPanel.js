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
const leveling = require('./leveling');
const { isModuleEnabled } = require('../../../core/guild/guildManager');

const LEADERBOARD_PAGE_SIZE = 10;
const LEADERBOARD_SORTS = new Set(['xp', 'level', 'messages', 'voice']);

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (customId, label, style = ButtonStyle.Primary, disabled = false) => new ButtonBuilder()
  .setCustomId(customId)
  .setLabel(label)
  .setStyle(style)
  .setDisabled(disabled);
const formatChannel = (id) => id ? `<#${id}>` : '`Not set`';
const formatRoles = (ids = []) => ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None`';
const formatChannels = (ids = []) => ids.length ? ids.map((id) => `<#${id}>`).join(', ') : '`None`';

function input(customId, label, value, style = TextInputStyle.Short, required = true, placeholder = null) {
  const component = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setValue(String(value ?? '').slice(0, 4000));
  if (placeholder) component.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(component);
}

function formatMultiplier(section, guildId) {
  const active = leveling.getActiveMultiplier(guildId, null);
  const multiplier = section.multiplier;
  if (!multiplier?.enabled) return 'No multiplier configured.';
  const sources = multiplier.sourceIds?.length ? multiplier.sourceIds.map((id) => `\`${id}\``).join(', ') : 'All enabled sources';
  const starts = multiplier.startsAt ? `<t:${Math.floor(new Date(multiplier.startsAt).getTime() / 1000)}:f>` : 'Immediately';
  const ends = multiplier.endsAt ? `<t:${Math.floor(new Date(multiplier.endsAt).getTime() / 1000)}:R>` : 'No end time';
  return `${active ? '🟢 Active' : '🟡 Scheduled / expired'} · **${multiplier.value}×**\n${multiplier.name || 'XP Multiplier'}\nApplies to: ${sources}\nStarts: ${starts}\nEnds: ${ends}`;
}

function sortLabel(sortBy) {
  if (sortBy === 'messages') return 'Messages';
  if (sortBy === 'voice') return 'Voice Activity';
  if (sortBy === 'level') return 'Level';
  return 'XP';
}

function leaderboardRows(guildId, { page = 0, sortBy = 'xp', includePaused = false } = {}) {
  const safeSort = LEADERBOARD_SORTS.has(sortBy) ? sortBy : 'xp';
  const records = leveling.getLeaderboard(guildId, 500, { includePaused, sortBy: safeSort });
  const totalPages = Math.max(1, Math.ceil(records.length / LEADERBOARD_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const start = safePage * LEADERBOARD_PAGE_SIZE;
  const visible = records.slice(start, start + LEADERBOARD_PAGE_SIZE);
  const lines = visible.length
    ? visible.map((user, index) => {
      const rank = start + index + 1;
      const detail = safeSort === 'messages'
        ? `${Number(user.messages || 0).toLocaleString()} messages`
        : safeSort === 'voice'
          ? `${Number(user.voiceMinutes || 0).toLocaleString()} voice minutes`
          : safeSort === 'level'
            ? `Level ${Number(user.level || 0).toLocaleString()} · ${Number(user.xp || 0).toLocaleString()} XP`
            : `${Number(user.xp || 0).toLocaleString()} XP · Level ${Number(user.level || 0).toLocaleString()}`;
      return `**${rank}.** <@${user.userId}> — ${detail}${user.participating === false ? ' · ⏸️ Paused' : ''}`;
    })
    : ['`No XP tracked yet.`'];
  return { records, lines, page: safePage, totalPages, sortBy: safeSort };
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
      `**Level Up Announcements:** ${section.announceLevelUps !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      '',
      '**XP Sources**',
      ...Object.entries(section.xpSources).map(([id, source]) => sourceLine(id, source)),
      '',
      '**XP Multiplier**',
      activeMultiplier
        ? `🟢 **${activeMultiplier.name || 'Active Multiplier'}** · ${activeMultiplier.value}×`
        : formatMultiplier(section, guild.id),
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
      row(
        button(enabled ? 'admin:leveling:disable' : 'admin:leveling:enable', enabled ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary),
        button('admin:leveling:toggleMessages', section.xpSources.message.enabled ? '💬 Messages On' : '💬 Messages Off', ButtonStyle.Secondary),
        button('admin:leveling:toggleVoice', section.xpSources.voice.enabled ? '🔊 Voice On' : '🔊 Voice Off', ButtonStyle.Secondary),
        button('admin:leveling:toggleAnnounce', section.announceLevelUps ? '📣 Announce On' : '📣 Announce Off', ButtonStyle.Secondary),
      ),
      row(
        button('admin:leveling:configureMessage', '💬 Message XP', ButtonStyle.Primary),
        button('admin:leveling:configureVoice', '🔊 Voice XP', ButtonStyle.Primary),
        button('admin:leveling:configureMultiplier', activeMultiplier ? '⚡ Edit Multiplier' : '⚡ Multiplier', ButtonStyle.Primary),
        button('admin:leveling:ranks', '🎭 Rank Rewards', ButtonStyle.Primary),
        button('admin:leveling:leaderboard', '🏆 Leaderboard', ButtonStyle.Primary),
      ),
      row(
        button('admin:leveling:trackingRules', '🚫 XP Exclusions', ButtonStyle.Secondary),
        button('admin:leveling:stopMultiplier', '⏹️ Stop Multiplier', ButtonStyle.Danger, !section.multiplier?.enabled),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary),
      ),
    ],
  };
}

function buildTrackingRulesPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const ignoredChannels = Array.isArray(section.ignoredChannelIds) ? section.ignoredChannelIds : [];
  const ignoredRoles = Array.isArray(section.ignoredRoleIds) ? section.ignoredRoleIds : [];
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🚫 XP Tracking Exclusions')
      .setDescription([
        'Members do not gain message or voice XP while an exclusion applies.',
        '',
        `**Ignored Channels:** ${formatChannels(ignoredChannels)}`,
        `**Ignored Roles:** ${formatRoles(ignoredRoles)}`,
        '',
        'Channel exclusions apply to both message and voice XP. Role exclusions apply to the member everywhere in this server.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(new ChannelSelectMenuBuilder()
        .setCustomId('admin:leveling:ignoredChannels')
        .setPlaceholder('Choose channels that must not award XP')
        .setMinValues(0)
        .setMaxValues(25)
        .setDefaultChannels(...ignoredChannels.slice(0, 25))),
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:leveling:ignoredRoles')
        .setPlaceholder('Choose roles that must not earn XP')
        .setMinValues(0)
        .setMaxValues(25)
        .setDefaultRoles(...ignoredRoles.slice(0, 25))),
      row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildRankRewardsPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const currentRoles = section.levelRewards.map((reward) => reward.roleId);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎭 Level Rank Rewards')
      .setDescription([
        'Choose reward roles in ascending level order, then configure the matching level requirements.',
        '',
        '**Current Rewards**',
        rewardLines(section),
        '',
        `**Role Behaviour:** ${section.removePreviousLevelRoles ? 'Replace previous rank roles' : 'Keep and stack earned rank roles'}`,
        '',
        'Example: select Bronze, Silver and Gold, then enter levels `5, 10, 20`.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:leveling:levelRoles')
        .setPlaceholder('Choose rank reward roles in ascending order')
        .setMinValues(0)
        .setMaxValues(10)
        .setDefaultRoles(...currentRoles.slice(0, 10))),
      row(
        button('admin:leveling:configureRankLevels', '🔢 Configure Levels', ButtonStyle.Primary, currentRoles.length === 0),
        button('admin:leveling:toggleRemovePrevious', section.removePreviousLevelRoles ? '🎭 Replace Ranks' : '🎭 Stack Ranks', ButtonStyle.Secondary),
      ),
      row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildMessageXpModal(section) {
  const source = section.xpSources.message;
  return new ModalBuilder()
    .setCustomId('admin:leveling:configureMessage:submit')
    .setTitle('Configure Message XP')
    .addComponents(
      input('amount', 'XP per eligible message', source.amount, TextInputStyle.Short, true, 'Example: 10'),
      input('cooldown', 'Cooldown in seconds', source.cooldownSeconds, TextInputStyle.Short, true, 'Example: 60'),
      input('description', 'User-facing description', source.description, TextInputStyle.Paragraph, false),
    );
}

function buildVoiceXpModal(section) {
  const source = section.xpSources.voice;
  return new ModalBuilder()
    .setCustomId('admin:leveling:configureVoice:submit')
    .setTitle('Configure Voice XP')
    .addComponents(
      input('amount', 'XP per interval', source.amount, TextInputStyle.Short, true, 'Example: 5'),
      input('interval', 'Interval in minutes', source.intervalMinutes, TextInputStyle.Short, true, 'Example: 10'),
      input('description', 'User-facing description', source.description, TextInputStyle.Paragraph, false),
    );
}

function buildMultiplierModal(section) {
  const multiplier = section.multiplier || {};
  const durationMinutes = multiplier.endsAt
    ? Math.max(1, Math.round((new Date(multiplier.endsAt).getTime() - Date.now()) / 60000))
    : 60;
  return new ModalBuilder()
    .setCustomId('admin:leveling:configureMultiplier:submit')
    .setTitle('Configure XP Multiplier')
    .addComponents(
      input('name', 'Multiplier name', multiplier.name || 'Double XP Event', TextInputStyle.Short, true),
      input('value', 'Multiplier value', multiplier.value > 1 ? multiplier.value : 2, TextInputStyle.Short, true, 'Example: 2'),
      input('duration', 'Duration in minutes', durationMinutes, TextInputStyle.Short, true, 'Example: 60'),
      input('sources', 'Sources (comma separated or ALL)', multiplier.sourceIds?.length ? multiplier.sourceIds.join(', ') : 'ALL', TextInputStyle.Short, true, 'message, voice'),
    );
}

function buildRankLevelsModal(section) {
  return new ModalBuilder()
    .setCustomId('admin:leveling:configureRankLevels:submit')
    .setTitle('Configure Rank Levels')
    .addComponents(input(
      'levels',
      'Levels matching selected roles',
      section.levelRewards.map((reward) => reward.level).join(', '),
      TextInputStyle.Short,
      true,
      'Example: 5, 10, 20',
    ));
}

function buildLeaderboardPanel(guild, memberDisplayName = 'Unknown User', page = 0, sortBy = 'xp') {
  const section = leveling.getSection(guild.id);
  const eligible = leveling.getEligibleUsers(guild.id, { includePaused: false });
  const paused = Object.keys(section.pausedUsers || {}).length;
  const board = leaderboardRows(guild.id, { page, sortBy, includePaused: true });
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🏆 Leveling Leaderboard')
    .setDescription([
      `Sorted by **${sortLabel(board.sortBy)}** · Page **${board.page + 1}/${board.totalPages}**`,
      '',
      ...board.lines,
      '',
      `Eligible active users: \`${eligible.length}\``,
      `Paused users: \`${paused}\``,
      '',
      'Paused members are shown for management visibility but remain excluded from giveaway eligibility by default.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const previousPage = Math.max(0, board.page - 1);
  const nextPage = Math.min(board.totalPages - 1, board.page + 1);
  return {
    embeds: [embed],
    components: [
      row(
        button('admin:leveling:leaderboard:xp:0', 'XP', board.sortBy === 'xp' ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:leveling:leaderboard:level:0', 'Level', board.sortBy === 'level' ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:leveling:leaderboard:messages:0', 'Messages', board.sortBy === 'messages' ? ButtonStyle.Success : ButtonStyle.Secondary),
        button('admin:leveling:leaderboard:voice:0', 'Voice', board.sortBy === 'voice' ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
      row(
        button(`admin:leveling:leaderboard:${board.sortBy}:${previousPage}`, '⬅️ Previous', ButtonStyle.Secondary, board.page <= 0),
        button(`admin:leveling:leaderboard:${board.sortBy}:${board.page}`, '🔄 Refresh', ButtonStyle.Secondary),
        button(`admin:leveling:leaderboard:${board.sortBy}:${nextPage}`, 'Next ➡️', ButtonStyle.Secondary, board.page >= board.totalPages - 1),
      ),
      row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

module.exports = {
  buildLevelingPanel,
  buildTrackingRulesPanel,
  buildRankRewardsPanel,
  buildMessageXpModal,
  buildVoiceXpModal,
  buildMultiplierModal,
  buildRankLevelsModal,
  buildLeaderboardPanel,
  buildLevelUpEmbed,
};
