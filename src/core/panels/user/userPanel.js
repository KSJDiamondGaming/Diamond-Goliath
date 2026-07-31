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
  { key: 'community', label: 'Community', emoji: '🏘️', summary: 'Giveaways, invites, leveling and polls.' },
  { key: 'feedback', label: 'Feedback', emoji: '💬', summary: 'Forms, suggestions and tickets.' },
  { key: 'messages', label: 'Messages', emoji: '✉️', summary: 'Member-visible message tools when approved.' },
  { key: 'roles', label: 'Roles', emoji: '🎭', summary: 'Reserved for future member role tools.' },
  { key: 'security', label: 'Security', emoji: '🛡️', summary: 'Reserved for future member security tools.' },
  { key: 'social', label: 'Social', emoji: '📣', summary: 'Social Studio member tools when approved.' },
  { key: 'utility', label: 'Utility', emoji: '🧰', summary: 'Help, ping, server info and translate.' },
];

const MODULE_CATALOG = [
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
  return interactionOrName?.member?.displayName ||
    interactionOrName?.user?.displayName ||
    interactionOrName?.user?.username ||
    'Unknown User';
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary, disabled = false, emoji = null) {
  const component = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

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

function buildSearchRow(selectedModule = null) {
  return row(
    new StringSelectMenuBuilder()
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
      }))),
  );
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
    components: [
      buildSearchRow(),
      ...buildCategoryButtons(),
    ].slice(0, 5),
  };
}

function buildCategoryPanel(categoryKey, interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const category = CATEGORY_BY_KEY[categoryKey] || CATEGORY_BY_KEY.community;
  const modules = MODULE_CATALOG.filter((module) => module.category === category.key);
  const description = [
    category.summary,
    '',
    modules.length
      ? modules.map((module) => `${module.emoji} **${module.label}** - ${module.summary}`).join('\n')
      : 'No user tools are approved in this category yet.',
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

function buildGiveawaysMemoPanel(interactionOrName = 'Unknown User') {
  const memberDisplayName = getMemberDisplayName(interactionOrName);
  const description = [
    '**DEV placeholder / memo panel**',
    '',
    'Planned member features:',
    '• View active giveaways',
    '• View giveaway history',
    '• View previous winners',
    '• View my entries',
    '• View my wins',
    '• View my giveaway statistics',
    '• Jump to giveaway message',
    '• Notification preferences (future)',
    '',
    '**Admin giveaway creation and management remain separate and are not exposed here.**',
  ].join('\n');

  return {
    embeds: [createEmbed('🎉 Giveaways - User Panel Plan', description, memberDisplayName, DEV_COLOR)],
    components: [
      row(
        button('user:category:community', 'Back to Community', ButtonStyle.Secondary, false, '⬅️'),
        button('user:home', 'User Panel', ButtonStyle.Secondary, false, '👤'),
      ),
    ],
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
    embeds: [createEmbed(
      `${module.emoji} ${module.label}`,
      ['**DEV placeholder / memo panel**', '', utilityHint, '', 'No admin controls are exposed from this panel.'].join('\n'),
      memberDisplayName,
      DEV_COLOR,
    )],
    components: [
      row(
        button(`user:category:${category.key}`, `Back to ${category.label}`, ButtonStyle.Secondary, false, '⬅️'),
        button('user:home', 'User Panel', ButtonStyle.Secondary, false, '👤'),
      ),
    ],
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
};
