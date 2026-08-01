const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const PANEL_COLOR = '#5865F2';
const DEV_COLOR = '#FEE75C';
const ITEMS_PER_ROW = 4;

const CATEGORY_CATALOG = [
  { key: 'account', label: 'Account', emoji: '👤', summary: 'View your personal Goliath profile and account tools.' },
  { key: 'community', label: 'Community', emoji: '🏘️', summary: 'Giveaways, invites, leveling and polls.' },
  { key: 'feedback', label: 'Feedback', emoji: '💬', summary: 'Forms, suggestions and tickets.' },
  { key: 'messages', label: 'Messages', emoji: '✉️', summary: 'Member-visible message tools when approved.' },
  { key: 'roles', label: 'Roles', emoji: '🎭', summary: 'Reserved for future member role tools.' },
  { key: 'security', label: 'Security', emoji: '🛡️', summary: 'Reserved for future member security tools.' },
  { key: 'social', label: 'Social', emoji: '📣', summary: 'Social Studio member tools when approved.' },
  { key: 'utility', label: 'Utility', emoji: '🧰', summary: 'Help, ping, server info and translate.' },
];

const MODULE_CATALOG = [
  { key: 'reputation', category: 'account', label: 'Reputation', emoji: '⭐', summary: 'Planned personal reputation view.', status: 'planned' },
  { key: 'warnings', category: 'account', label: 'Warnings', emoji: '⚠️', summary: 'Planned personal warning view.', status: 'planned' },
  { key: 'cases', category: 'account', label: 'Cases', emoji: '📁', summary: 'Planned view of your own cases.', status: 'planned' },
  { key: 'infractions', category: 'account', label: 'Infractions', emoji: '📋', summary: 'Planned personal infraction history.', status: 'planned' },
  { key: 'appeals', category: 'account', label: 'Appeals', emoji: '📝', summary: 'Planned personal appeal access.', status: 'planned' },
  { key: 'notes', category: 'account', label: 'Notes', emoji: '📌', summary: 'Planned personal notes.', status: 'planned' },
  { key: 'giveaways', category: 'community', label: 'Giveaways', emoji: '🎉', summary: 'Member giveaway dashboard plan.', status: 'locked' },
  { key: 'invites', category: 'community', label: 'Invites', emoji: '📨', summary: 'Planned member invite view.', status: 'planned' },
  { key: 'leveling', category: 'community', label: 'Leveling', emoji: '🏆', summary: 'Planned member rank/profile view.', status: 'planned' },
  { key: 'polls', category: 'community', label: 'Polls', emoji: '📊', summary: 'Planned member poll view.', status: 'planned' },
  { key: 'forms', category: 'feedback', label: 'Forms', emoji: '📝', summary: 'Planned member form access.', status: 'planned' },
  { key: 'suggestions', category: 'feedback', label: 'Suggestions', emoji: '💡', summary: 'Planned member suggestion access.', status: 'planned' },
  { key: 'tickets', category: 'feedback', label: 'Tickets', emoji: '🎫', summary: 'Planned member ticket access.', status: 'planned' },
  { key: 'starboard', category: 'messages', label: 'Starboard', emoji: '⭐', summary: 'Planned member starboard view.', status: 'planned' },
  { key: 'social', category: 'social', label: 'Social Studio', emoji: '📣', summary: 'Planned member social view.', status: 'planned' },
  { key: 'help', category: 'utility', label: 'Help', emoji: '📚', summary: 'Existing /help command.', status: 'approved' },
  { key: 'ping', category: 'utility', label: 'Ping', emoji: '🏓', summary: 'Existing /ping command.', status: 'approved' },
  { key: 'serverinfo', category: 'utility', label: 'Server Info', emoji: '🏰', summary: 'Existing /serverinfo command.', status: 'approved' },
  { key: 'translate', category: 'utility', label: 'Translate', emoji: '🌐', summary: 'Existing /translate command.', status: 'approved' },
];

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORY_CATALOG.map((category) => [category.key, category]));
const MODULE_BY_KEY = Object.fromEntries(MODULE_CATALOG.map((module) => [module.key, module]));

function getMemberDisplayName(interactionOrName = 'Unknown User') {
  if (typeof interactionOrName === 'string') return interactionOrName || 'Unknown User';
  return interactionOrName?.member?.displayName || interactionOrName?.user?.displayName || interactionOrName?.user?.username || 'Unknown User';
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const component = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) component.setEmoji(emoji);
  return component;
}

function chunk(items, size) {
  const rows = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

function createEmbed(title, description, memberDisplayName, color = PANEL_COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();
}

function markLiveEmbed(embed) {
  return embed.setFooter({ text: 'Last refreshed' }).setTimestamp();
}

function discordTimestamp(timestamp, style = 'R') {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `<t:${Math.floor(value / 1000)}:${style}>`;
}

function compactDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', ' •');
}

function progressDetails(levelingProfile = {}) {
  const level = Math.max(0, Number(levelingProfile.level || 0));
  const xp = Math.max(0, Number(levelingProfile.xp || 0));
  const currentLevelXp = Math.max(0, Number(levelingProfile.currentLevelXp || 0));
  const nextLevelXp = Math.max(currentLevelXp + 1, Number(levelingProfile.nextLevelXp || currentLevelXp + 1));
  const earnedThisLevel = Math.max(0, xp - currentLevelXp);
  const neededThisLevel = Math.max(1, nextLevelXp - currentLevelXp);
  const percent = Math.min(100, Math.floor((earnedThisLevel / neededThisLevel) * 100));
  const filled = Math.min(10, Math.floor(percent / 10));
  return {
    level,
    xp,
    earnedThisLevel,
    neededThisLevel,
    percent,
    bar: `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`,
  };
}

function buildSearchRow(selectedModule = null) {
  return row(new StringSelectMenuBuilder()
    .setCustomId('user:search')
    .setPlaceholder('🔎 Search or jump to a user tool')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(MODULE_CATALOG.slice(0, 25).map((module) => ({
      label: module.label,
      description: module.summary.slice(0, 100),
      value: module.key,
      emoji: module.emoji,
      default: selectedModule === module.key,
    }))));
}

function buildCategoryButtons() {
  return chunk(CATEGORY_CATALOG.map((category) => button(
    `user:category:${category.key}`,
    category.label,
    ButtonStyle.Primary,
    false,
    category.emoji,
  )), ITEMS_PER_ROW).map((items) => row(...items));
}

function buildMainPanel(interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const description = [
    'Select a category to access member tools.',
    '',
    CATEGORY_CATALOG.map((category) => `${category.emoji} **${category.label}** - ${category.summary}`).join('\n'),
  ].join('\n');
  return {
    embeds: [createEmbed('👤 Goliath User Panel', description, memberDisplayName)],
    components: [buildSearchRow(), ...buildCategoryButtons()].slice(0, 5),
  };
}

function buildCategoryPanel(categoryKey, interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const category = CATEGORY_BY_KEY[categoryKey] || CATEGORY_BY_KEY.community;
  const modules = MODULE_CATALOG.filter((module) => module.category === category.key);
  const description = [
    category.summary,
    '',
    modules.length ? modules.map((module) => `${module.emoji} **${module.label}** - ${module.summary}`).join('\n') : 'No user tools are approved in this category yet.',
  ].join('\n');
  const moduleButtons = modules.map((module) => button(
    `user:module:${module.key}`,
    module.label,
    module.key === 'giveaways' ? ButtonStyle.Success : ButtonStyle.Secondary,
    false,
    module.emoji,
  ));
  return {
    embeds: [createEmbed(`${category.emoji} ${category.label}`, description, memberDisplayName)],
    components: [
      buildSearchRow(),
      ...chunk(moduleButtons, ITEMS_PER_ROW).map((items) => row(...items)),
      row(button('user:home', 'Back to User Panel', ButtonStyle.Secondary, false, '⬅️')),
    ].slice(0, 5),
  };
}

function buildProfilePanel(interaction, profile = {}, options = {}) {
  const memberDisplayName = getMemberDisplayName(interaction);
  const user = interaction.user;
  const member = interaction.member;
  const created = compactDate(user?.createdTimestamp);
  const joined = compactDate(member?.joinedTimestamp);
  const joinedRelative = discordTimestamp(member?.joinedTimestamp, 'R');

  const identity = [
    `<@${user?.id || '0'}>`,
    `${user?.username || 'unknown'}`,
    `User ID: \`${user?.id || 'unknown'}\``,
  ];

  const membership = [
    created ? `Discord Account Created: **${created}**` : null,
    joined ? `Joined This Server: **${joined}**` : null,
    joinedRelative ? `Member For: **${joinedRelative}**` : null,
  ].filter(Boolean);

  const progress = [];
  if (profile.leveling) {
    const details = progressDetails(profile.leveling);
    progress.push(`Level: **${details.level}**`);
    progress.push(`XP: **${details.earnedThisLevel.toLocaleString()} / ${details.neededThisLevel.toLocaleString()}**`);
    progress.push(`\`${details.bar}\` **${details.percent}%**`);
    if (profile.leveling.rank) progress.push(`Server Rank: **#${profile.leveling.rank}**`);
  }

  const community = [];
  if (Number.isFinite(profile.invites)) community.push(`Invites: **${profile.invites.toLocaleString()}**`);
  if (Number.isFinite(profile.giveawayEntries)) community.push(`Giveaway Entries: **${profile.giveawayEntries.toLocaleString()}**`);
  if (Number.isFinite(profile.giveawayWins)) community.push(`Giveaway Wins: **${profile.giveawayWins.toLocaleString()}**`);

  const sections = [identity.join('\n')];
  if (membership.length) sections.push(`📅 **Membership**\n${membership.join('\n')}`);
  if (progress.length) sections.push(`🏆 **Progress**\n${progress.join('\n')}`);
  if (community.length) sections.push(`📊 **Community**\n${community.join('\n')}`);

  const embed = markLiveEmbed(createEmbed('👤 Your Profile', sections.join('\n\n'), memberDisplayName))
    .setThumbnail(user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null);

  const profileButtons = [];
  if (profile.leveling) profileButtons.push(button('user:profile:progress', 'View Progress', ButtonStyle.Primary, false, '🏆'));
  if (options.rolesEnabled !== false) profileButtons.push(button('user:profile:roles', 'View Roles', ButtonStyle.Primary, false, '🎭'));
  profileButtons.push(button('user:profile:refresh', 'Refresh', ButtonStyle.Success, false, '🔄'));

  const accountModules = MODULE_CATALOG.filter((module) => module.category === 'account');
  const accountRows = chunk(accountModules.map((module) => button(
    `user:module:${module.key}`,
    module.label,
    ButtonStyle.Secondary,
    false,
    module.emoji,
  )), ITEMS_PER_ROW).map((items) => row(...items));

  return {
    embeds: [embed],
    components: [
      row(...profileButtons),
      ...accountRows,
      row(
        button('user:home', 'User Panel', ButtonStyle.Secondary, false, '🏠'),
        button('user:close', 'Close', ButtonStyle.Danger, false, '✖️'),
      ),
    ].slice(0, 5),
  };
}

function buildProgressPanel(interaction, levelingProfile = {}) {
  const memberDisplayName = getMemberDisplayName(interaction);
  const details = progressDetails(levelingProfile);
  const lines = [
    `Level: **${details.level}**`,
    `Total XP: **${details.xp.toLocaleString()}**`,
    levelingProfile.rank ? `Server Rank: **#${levelingProfile.rank}**` : null,
    '',
    `Next Level: **${details.earnedThisLevel.toLocaleString()} / ${details.neededThisLevel.toLocaleString()} XP**`,
    `\`${details.bar}\` **${details.percent}%**`,
    Number.isFinite(levelingProfile.messages) ? `Messages Tracked: **${levelingProfile.messages.toLocaleString()}**` : null,
    Number.isFinite(levelingProfile.voiceMinutes) ? `Voice Activity: **${levelingProfile.voiceMinutes.toLocaleString()} minutes**` : null,
  ].filter((line) => line !== null);
  return {
    embeds: [markLiveEmbed(createEmbed('🏆 Your Progress', lines.join('\n'), memberDisplayName))],
    components: [row(
      button('user:category:account', 'Back to Profile', ButtonStyle.Secondary, false, '⬅️'),
      button('user:profile:progress', 'Refresh', ButtonStyle.Success, false, '🔄'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, false, '🏠'),
      button('user:close', 'Close', ButtonStyle.Danger, false, '✖️'),
    )],
  };
}

function buildRolesPanel(interaction, options = {}) {
  const memberDisplayName = getMemberDisplayName(interaction);
  const roles = [...(interaction.member?.roles?.cache?.values?.() || [])]
    .filter((role) => role.id !== interaction.guildId)
    .sort((a, b) => b.position - a.position);
  const highest = roles[0] || null;
  const roleMentions = roles.map((role) => `<@&${role.id}>`);
  const visible = roleMentions.slice(0, 30);
  const remaining = Math.max(0, roleMentions.length - visible.length);
  const description = [
    options.showHighestRole === false ? null : `**Highest Role**\n${highest ? `<@&${highest.id}>` : 'None'}`,
    options.showRoleCount === false ? null : `**Role Count**\n${roles.length}`,
    options.showRoleList === false ? null : `**Current Roles**\n${visible.length ? visible.join('\n') : 'No roles assigned.'}${remaining ? `\n\n+${remaining} more` : ''}`,
  ].filter(Boolean).join('\n\n');
  return {
    embeds: [markLiveEmbed(createEmbed('🎭 Your Roles', description || 'Role visibility is disabled for this server.', memberDisplayName))],
    components: [row(
      button('user:category:account', 'Back to Profile', ButtonStyle.Secondary, false, '⬅️'),
      button('user:profile:roles', 'Refresh', ButtonStyle.Success, false, '🔄'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, false, '🏠'),
      button('user:close', 'Close', ButtonStyle.Danger, false, '✖️'),
    )],
  };
}

function buildGiveawaysMemoPanel(interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const description = [
    '**DEV placeholder / memo panel**', '', 'Planned member features:',
    '• View active giveaways', '• View giveaway history', '• View previous winners', '• View my entries', '• View my wins',
    '• View my giveaway statistics', '• Jump to giveaway message', '• Notification preferences (future)', '',
    '**Admin giveaway creation and management remain separate and are not exposed here.**',
  ].join('\n');
  return {
    embeds: [createEmbed('🎉 Giveaways - User Panel Plan', description, memberDisplayName, DEV_COLOR)],
    components: [row(
      button('user:category:community', 'Back to Community', ButtonStyle.Secondary, false, '⬅️'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, false, '👤'),
    )],
  };
}

function buildSocialAccessDeniedPanel(interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  return {
    embeds: [createEmbed('Social Studio', ['This server only allows selected roles to use Social Studio from `/user`.', '', 'Ask a server admin if you should have access.'].join('\n'), memberDisplayName, DEV_COLOR)],
    components: [row(
      button('user:category:social', 'Back to Social', ButtonStyle.Secondary, false, '⬅️'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, false, '👤'),
    )],
  };
}

function buildPlannedModulePanel(moduleKey, interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const module = MODULE_BY_KEY[moduleKey];
  if (!module) return buildMainPanel(memberDisplayName);
  const category = CATEGORY_BY_KEY[module.category];
  const utilityHint = module.category === 'utility'
    ? `This tool is approved for the User Panel and currently remains available through \`/${module.key}\`.`
    : 'This module button is reserved for a future user-only view.';
  return {
    embeds: [createEmbed(`${module.emoji} ${module.label}`, ['**DEV placeholder / memo panel**', '', utilityHint, '', 'No admin controls are exposed from this panel.'].join('\n'), memberDisplayName, DEV_COLOR)],
    components: [row(
      button(`user:category:${category.key}`, `Back to ${category.key === 'account' ? 'Profile' : category.label}`, ButtonStyle.Secondary, false, '⬅️'),
      button('user:home', 'User Panel', ButtonStyle.Secondary, false, '👤'),
    )],
  };
}

function buildModulePanel(moduleKey, interactionOrName = 'Unknown User') {
  if (moduleKey === 'giveaways') return buildGiveawaysMemoPanel(interactionOrName);
  return buildPlannedModulePanel(moduleKey, interactionOrName);
}

module.exports = {
  CATEGORY_CATALOG,
  MODULE_CATALOG,
  buildMainPanel,
  buildCategoryPanel,
  buildModulePanel,
  buildProfilePanel,
  buildProgressPanel,
  buildRolesPanel,
  buildSocialAccessDeniedPanel,
};
