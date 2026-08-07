'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
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

function multiplierState(multiplier, at = Date.now()) {
  if (!multiplier?.enabled || Number(multiplier.value || 1) <= 1) return 'none';
  const starts = multiplier.startsAt ? new Date(multiplier.startsAt).getTime() : null;
  const ends = multiplier.endsAt ? new Date(multiplier.endsAt).getTime() : null;
  if (Number.isFinite(ends) && at >= ends) return 'expired';
  if (Number.isFinite(starts) && at < starts) return 'scheduled';
  return 'active';
}

function formatMultiplier(section, guildId) {
  const multiplier = section.multiplier;
  const state = multiplierState(multiplier);
  if (state === 'none') return 'No multiplier configured.';
  const sources = multiplier.sourceIds?.length ? multiplier.sourceIds.map((id) => `\`${id}\``).join(', ') : 'All enabled sources';
  const starts = multiplier.startsAt ? `<t:${Math.floor(new Date(multiplier.startsAt).getTime() / 1000)}:f>` : 'Immediately';
  const ends = multiplier.endsAt ? `<t:${Math.floor(new Date(multiplier.endsAt).getTime() / 1000)}:R>` : 'No end time';
  const stateLabel = state === 'active' ? '🟢 Active' : state === 'scheduled' ? '🟡 Scheduled' : '⚪ Expired';
  return `${stateLabel} · **${multiplier.value}×**\n${multiplier.name || 'XP Multiplier'}\nApplies to: ${sources}\nStarts: ${starts}\nEnds: ${ends}`;
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

function sourceAnalyticsLines(section) {
  const totals = section.analytics?.xpBySource || {};
  const grandTotal = Math.max(0, Number(section.analytics?.xpAwarded || 0));
  const entries = Object.entries(section.xpSources || {})
    .map(([id, config]) => ({ id, label: config.label || id, amount: Math.max(0, Number(totals[id] || 0)) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (!entries.length) return ['`No source XP has been awarded yet.`'];
  return entries.slice(0, 8).map((entry) => {
    const percent = grandTotal > 0 ? Math.round((entry.amount / grandTotal) * 100) : 0;
    return `• **${entry.label}** — ${entry.amount.toLocaleString()} XP (${percent}%)`;
  });
}

function recentActivityLines(section) {
  const records = [
    ...Object.values(section.users || {}).map((user) => ({ ...user, participating: true })),
    ...Object.values(section.pausedUsers || {}).map((user) => ({ ...user, participating: false })),
  ]
    .filter((user) => user?.userId && user?.lastXpAt)
    .map((user) => ({ ...user, lastXpMs: new Date(user.lastXpAt).getTime() }))
    .filter((user) => Number.isFinite(user.lastXpMs))
    .sort((a, b) => b.lastXpMs - a.lastXpMs)
    .slice(0, 5);
  if (!records.length) return ['`No recent XP activity recorded yet.`'];
  return records.map((user) => {
    const timestamp = Math.floor(user.lastXpMs / 1000);
    const source = user.lastXpSource ? ` · \`${user.lastXpSource}\`` : '';
    return `• <@${user.userId}> — Level **${Number(user.level || 0)}** · ${Number(user.xp || 0).toLocaleString()} XP${source} · <t:${timestamp}:R>${user.participating === false ? ' · ⏸️' : ''}`;
  });
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

function rewardLines(section, limit = 15) {
  if (!section.levelRewards.length) return '`No level reward roles configured.`';
  return section.levelRewards
    .slice(0, limit)
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
        button('admin:leveling:multiplier', '⚡ XP Event', ButtonStyle.Primary),
        button('admin:leveling:ranks', '🎭 Rank Rewards', ButtonStyle.Primary),
        button('admin:leveling:leaderboard', '📊 Analytics', ButtonStyle.Primary),
      ),
      row(
        button('admin:leveling:trackingRules', '🚫 XP Exclusions', ButtonStyle.Secondary),
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

function rewardBehaviourLabel(section) {
  return section.rewardBehaviour === leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY
    ? 'Keep highest reward only'
    : 'Stack all earned reward roles';
}

function buildRankRewardsPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const missing = leveling.getMissingLevelRewards(guild);
  const highest = section.levelRewards.length ? section.levelRewards[section.levelRewards.length - 1] : null;
  return {
    embeds: [new EmbedBuilder()
      .setColor(missing.length ? 0xFEE75C : 0x5865f2)
      .setTitle('🏅 Level Reward Manager')
      .setDescription([
        'Create and manage the roles members earn as they level up.',
        '',
        `**Configured Rewards:** ${section.levelRewards.length}`,
        `**Highest Reward:** ${highest ? `Level ${highest.level} → <@&${highest.roleId}>` : 'None'}`,
        `**Reward Behaviour:** ${rewardBehaviourLabel(section)}`,
        `**Missing Roles:** ${missing.length}`,
        '',
        '**Current Rewards**',
        rewardLines(section),
        missing.length ? `\n⚠️ ${missing.length} configured reward role${missing.length === 1 ? ' is' : 's are'} missing from Discord.` : '',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:leveling:ranks:add', '➕ Add Rewards', ButtonStyle.Success),
        button('admin:leveling:ranks:manage', '🛠️ Manage Rewards', ButtonStyle.Primary, section.levelRewards.length === 0),
        button('admin:leveling:ranks:preview', '👁️ Preview', ButtonStyle.Secondary, section.levelRewards.length === 0),
      ),
      row(
        button('admin:leveling:ranks:behaviour', section.rewardBehaviour === leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY ? '🎭 Highest Only' : '🎭 Stack Rewards', ButtonStyle.Secondary),
        button('admin:leveling:ranks:repair', '🩹 Repair Missing', ButtonStyle.Danger, missing.length === 0),
      ),
      row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildAddRewardsPanel(guild, memberDisplayName = 'Unknown User') {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('➕ Add Level Rewards')
      .setDescription([
        'Select one or more roles to add as level rewards.',
        '',
        'After selecting the roles, you will enter the matching levels in the same order.',
        '',
        'Example: select Bronze, Silver, Gold → enter `5, 10, 20`.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(new RoleSelectMenuBuilder()
        .setCustomId('admin:leveling:ranks:add:roles')
        .setPlaceholder('Select reward roles')
        .setMinValues(1)
        .setMaxValues(10)),
      row(button('admin:leveling:ranks', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildAddRewardLevelsModal(roleIds = []) {
  return new ModalBuilder()
    .setCustomId(`admin:leveling:ranks:add:levels:${roleIds.join('.')}`)
    .setTitle('Set Reward Levels')
    .addComponents(input(
      'levels',
      `Levels for ${roleIds.length} selected role${roleIds.length === 1 ? '' : 's'}`,
      '',
      TextInputStyle.Short,
      true,
      roleIds.length === 1 ? 'Example: 25' : 'Example: 5, 10, 20',
    ));
}

function buildManageRewardsPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const rewards = section.levelRewards.slice(0, 25);
  const select = new StringSelectMenuBuilder()
    .setCustomId('admin:leveling:ranks:select')
    .setPlaceholder('Select a reward to manage')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(rewards.map((reward) => ({
      label: `Level ${reward.level}`.slice(0, 100),
      description: `Role ${reward.roleId}`.slice(0, 100),
      value: String(reward.level),
    })));

  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🛠️ Manage Level Rewards')
      .setDescription([
        'Select a configured reward to edit or delete it.',
        '',
        rewardLines(section, 25),
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(select),
      row(button('admin:leveling:ranks', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildRewardDetailPanel(guild, level, memberDisplayName = 'Unknown User') {
  const reward = leveling.getLevelRewards(guild.id).find((entry) => Number(entry.level) === Number(level));
  if (!reward) return buildManageRewardsPanel(guild, memberDisplayName);
  const roleExists = guild.roles.cache.has(reward.roleId);
  return {
    embeds: [new EmbedBuilder()
      .setColor(roleExists ? 0x5865f2 : 0xFEE75C)
      .setTitle(`🏅 Reward · Level ${reward.level}`)
      .setDescription([
        `**Level:** ${reward.level}`,
        `**Role:** <@&${reward.roleId}>`,
        `**Role Status:** ${roleExists ? 'Available ✅' : 'Missing ⚠️'}`,
        `**Behaviour:** ${rewardBehaviourLabel(leveling.getSection(guild.id))}`,
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button(`admin:leveling:ranks:edit:${reward.level}`, '✏️ Edit', ButtonStyle.Primary),
        button(`admin:leveling:ranks:delete:${reward.level}`, '🗑️ Delete', ButtonStyle.Danger),
      ),
      row(button('admin:leveling:ranks:manage', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildEditRewardModal(reward) {
  return new ModalBuilder()
    .setCustomId(`admin:leveling:ranks:edit:${reward.level}:submit`)
    .setTitle(`Edit Level ${reward.level} Reward`)
    .addComponents(
      input('level', 'Required level', reward.level, TextInputStyle.Short, true, 'Example: 25'),
      input('roleId', 'Discord role ID', reward.roleId, TextInputStyle.Short, true, 'Paste the role ID'),
      input('label', 'Optional label', reward.label || '', TextInputStyle.Short, false, 'Example: Diamond'),
    );
}

function buildDeleteRewardConfirmPanel(guild, level, memberDisplayName = 'Unknown User') {
  const reward = leveling.getLevelRewards(guild.id).find((entry) => Number(entry.level) === Number(level));
  if (!reward) return buildManageRewardsPanel(guild, memberDisplayName);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('⚠️ Delete Level Reward')
      .setDescription(`Delete the **Level ${reward.level}** reward for <@&${reward.roleId}>?\n\nThis removes the reward mapping only. It does not delete the Discord role.`)
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button(`admin:leveling:ranks:view:${reward.level}`, 'Cancel', ButtonStyle.Secondary),
        button(`admin:leveling:ranks:delete:${reward.level}:confirm`, 'Delete Reward', ButtonStyle.Danger),
      ),
    ],
  };
}

function buildRewardsPreviewPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const highestOnly = section.rewardBehaviour === leveling.REWARD_BEHAVIOURS.HIGHEST_ONLY;
  const lines = section.levelRewards.slice(0, 25).flatMap((reward, index) => {
    const previous = index > 0 ? section.levelRewards[index - 1] : null;
    const behaviour = highestOnly && previous
      ? `<@&${previous.roleId}> removed → <@&${reward.roleId}> added`
      : `<@&${reward.roleId}> added`;
    return [`**Level ${reward.level}**`, `↳ ${behaviour}`];
  });
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('👁️ Level Reward Preview')
      .setDescription([
        `**Behaviour:** ${rewardBehaviourLabel(section)}`,
        '',
        ...(lines.length ? lines : ['No rewards configured.']),
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [row(button('admin:leveling:ranks', '⬅️ Back', ButtonStyle.Secondary))],
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

function buildMultiplierManagerPanel(guild, memberDisplayName = 'Unknown User') {
  const section = leveling.getSection(guild.id);
  const multiplier = section.multiplier || {};
  const state = multiplierState(multiplier);
  const activeOrScheduled = state === 'active' || state === 'scheduled';
  const stateLabel = state === 'active' ? '🟢 Active' : state === 'scheduled' ? '🟡 Scheduled' : state === 'expired' ? '⚪ Expired' : '⚫ None';
  const starts = multiplier.startsAt ? `<t:${Math.floor(new Date(multiplier.startsAt).getTime() / 1000)}:F>\n<t:${Math.floor(new Date(multiplier.startsAt).getTime() / 1000)}:R>` : 'Immediately';
  const ends = multiplier.endsAt ? `<t:${Math.floor(new Date(multiplier.endsAt).getTime() / 1000)}:F>\n<t:${Math.floor(new Date(multiplier.endsAt).getTime() / 1000)}:R>` : 'No end time';
  const sources = multiplier.sourceIds?.length ? multiplier.sourceIds.map((id) => `\`${id}\``).join(', ') : 'All enabled XP sources';

  return {
    embeds: [new EmbedBuilder()
      .setColor(state === 'active' ? 0x57f287 : state === 'scheduled' ? 0xFEE75C : 0x5865f2)
      .setTitle('⚡ XP Event Manager')
      .setDescription([
        'Create an XP multiplier for an event now or schedule it to begin later.',
        '',
        `**Status:** ${stateLabel}`,
        `**Event:** ${multiplier.name || 'No event configured'}`,
        `**Multiplier:** ${Number(multiplier.value || 1)}×`,
        `**Sources:** ${sources}`,
        '',
        '**Starts**',
        starts,
        '',
        '**Ends**',
        ends,
        '',
        state === 'scheduled'
          ? 'The multiplier will automatically become effective at the scheduled start time.'
          : state === 'active'
            ? 'XP awards are currently using this multiplier for the selected sources.'
            : 'Create an event to activate or schedule an XP multiplier.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:leveling:configureMultiplier', activeOrScheduled ? '✏️ Edit Event' : '➕ Create Event', activeOrScheduled ? ButtonStyle.Primary : ButtonStyle.Success),
        button('admin:leveling:stopMultiplier', state === 'scheduled' ? '✖️ Cancel Event' : '⏹️ Stop Event', ButtonStyle.Danger, !activeOrScheduled),
      ),
      row(button('admin:leveling', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildMultiplierModal(section) {
  const multiplier = section.multiplier || {};
  const startsAtMs = multiplier.startsAt ? new Date(multiplier.startsAt).getTime() : Date.now();
  const endsAtMs = multiplier.endsAt ? new Date(multiplier.endsAt).getTime() : startsAtMs + 60 * 60000;
  const durationMinutes = Math.max(1, Math.round((endsAtMs - startsAtMs) / 60000));
  const startDelayMinutes = Math.max(0, Math.round((startsAtMs - Date.now()) / 60000));
  return new ModalBuilder()
    .setCustomId('admin:leveling:configureMultiplier:submit')
    .setTitle('Configure XP Event')
    .addComponents(
      input('name', 'Event name', multiplier.name || 'Double XP Event', TextInputStyle.Short, true),
      input('value', 'XP multiplier', multiplier.value > 1 ? multiplier.value : 2, TextInputStyle.Short, true, 'Example: 2'),
      input('startDelay', 'Starts in minutes (0 = now)', startDelayMinutes, TextInputStyle.Short, true, 'Example: 0 or 120'),
      input('duration', 'Duration in minutes', durationMinutes, TextInputStyle.Short, true, 'Example: 60 or 2880'),
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
  const active = Object.keys(section.users || {}).length;
  const board = leaderboardRows(guild.id, { page, sortBy, includePaused: true });
  const analytics = section.analytics || {};
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 XP Analytics & Leaderboard')
    .setDescription([
      '**Server XP Overview**',
      `XP Awarded: **${Number(analytics.xpAwarded || 0).toLocaleString()}**`,
      `Level Ups: **${Number(analytics.levelUps || 0).toLocaleString()}**`,
      `Messages Tracked: **${Number(analytics.messagesTracked || 0).toLocaleString()}**`,
      `Voice Minutes Tracked: **${Number(analytics.voiceMinutesTracked || 0).toLocaleString()}**`,
      `Participants: **${active} active** · **${paused} paused**`,
      '',
      '**XP by Source**',
      ...sourceAnalyticsLines(section),
      '',
      '**Recent XP Activity**',
      ...recentActivityLines(section),
      '',
      `**Leaderboard — ${sortLabel(board.sortBy)}** · Page **${board.page + 1}/${board.totalPages}**`,
      ...board.lines,
      '',
      `Giveaway-eligible active users: \`${eligible.length}\``,
      'Paused members remain visible to admins but are excluded from giveaway eligibility by default.',
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
  buildAddRewardsPanel,
  buildAddRewardLevelsModal,
  buildManageRewardsPanel,
  buildRewardDetailPanel,
  buildEditRewardModal,
  buildDeleteRewardConfirmPanel,
  buildRewardsPreviewPanel,
  buildMessageXpModal,
  buildVoiceXpModal,
  buildMultiplierManagerPanel,
  buildMultiplierModal,
  buildRankLevelsModal,
  buildLeaderboardPanel,
  buildLevelUpEmbed,
};
