'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function button(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const component = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
  if (emoji) component.setEmoji(emoji);
  return component;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function refreshHelpPanel(payload) {
  const embed = payload?.embeds?.[0];
  const title = embed?.data?.title || embed?.title || '';
  if (title !== '❓ Goliath User Panel Help') return payload;

  const description = [
    'Welcome to your personal Goliath User Panel.',
    '',
    '**👤 Profile Home**',
    'Your profile information is displayed directly on the landing panel.',
    '',
    '**📌 Personal Tools**',
    '🗂️ **Account Record** — Your own account history.',
    '📌 **Notes** — Planned private personal notebook.',
    '⚙️ **Preferences** — Future personal settings.',
    '❓ **Help** — User Panel guidance.',
    '',
    '**📂 Categories**',
    '🏘️ **Community** — Giveaways, invites, leveling and polls.',
    '💬 **Feedback** — Forms, suggestions and tickets.',
    '✉️ **Messages** — Member message tools.',
    '🎭 **Roles** — View roles and role history.',
    '🛡️ **Security** — Verification and notifications.',
    '📣 **Social** — Your Social Studio Creator Profile.',
    '🧰 **Utility** — Utility tools and future features.',
  ].join('\n');

  if (typeof embed.setDescription === 'function') embed.setDescription(description);
  return payload;
}

function removeDuplicateDevelopmentButtons(payload) {
  if (!Array.isArray(payload?.components)) return payload;

  const removed = new Set([
    'user:module:reputation',
    'user:module:profile-settings',
    'user:module:roles',
    'user:module:security',
    'user:module:social',
    'user:category:utility',
  ]);

  payload.components = payload.components
    .map((r) => {
      if (!Array.isArray(r.components)) return r;
      r.components = r.components.filter((c) => !removed.has(c?.data?.custom_id));
      return r;
    })
    .filter((r) => r.components.length);

  return payload;
}

function normaliseNavigation(payload) {
  return payload;
}

function sortNonNavigationButtons(payload) {
  refreshHelpPanel(payload);
  removeDuplicateDevelopmentButtons(payload);
  return payload;
}

function buildProfileDevelopmentPage(interaction) {
  const name = interaction.member?.displayName || interaction.user?.username || 'Unknown User';

  return {
    embeds: [new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('🚧 User Panel Development Tools')
      .setDescription([
        'Development roadmap for future User Panel sections.',
        '',
        'Navigation only. Business logic remains owned by existing modules.',
        '',
        'Duplicate routes have been removed. Categories own their modules.',
      ].join('\n'))
      .setFooter({ text: `Requested by ${name}` })
      .setTimestamp()],
    components: [
      row(
        button('user:module:forms', 'Forms', ButtonStyle.Secondary, '📝'),
        button('user:module:giveaways', 'Giveaways', ButtonStyle.Secondary, '🎉'),
        button('user:module:invites', 'Invites', ButtonStyle.Secondary, '📨'),
        button('user:module:leveling', 'Leveling', ButtonStyle.Secondary, '🏆'),
      ),
      row(
        button('user:module:polls', 'Polls', ButtonStyle.Secondary, '📊'),
        button('user:module:starboard', 'Starboard', ButtonStyle.Secondary, '⭐'),
        button('user:module:suggestions', 'Suggestions', ButtonStyle.Secondary, '💡'),
        button('user:module:tickets', 'Tickets', ButtonStyle.Secondary, '🎫'),
      ),
      row(
        button('user:home', 'Back', ButtonStyle.Secondary, '⬅️'),
        button('user:in-progress:0', 'In Progress', ButtonStyle.Secondary, '🚧'),
      ),
    ],
  };
}

module.exports = {
  buildProfileDevelopmentPage,
  normaliseNavigation,
  refreshHelpPanel,
  sortNonNavigationButtons,
  removeDuplicateDevelopmentButtons,
};
