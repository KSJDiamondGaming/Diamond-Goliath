'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function button(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const component = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) component.setEmoji(emoji);
  return component;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function componentId(component) {
  return component?.data?.custom_id || component?.customId || null;
}

function componentLabel(component) {
  return String(component?.data?.label || component?.label || '');
}

function isButtonRow(actionRow) {
  return Array.isArray(actionRow?.components)
    && actionRow.components.every((component) => component?.data?.type === 2);
}

function embedTitle(payload) {
  const embed = payload?.embeds?.[0];
  return embed?.data?.title || embed?.title || '';
}

function cleanSearchOptions(payload) {
  for (const actionRow of payload?.components || []) {
    for (const component of actionRow?.components || []) {
      if (componentId(component) !== 'user:search' || !Array.isArray(component.options)) continue;
      component.options = component.options.filter((option) => {
        const value = option?.data?.value || option?.value;
        return !['reputation', 'profile-settings'].includes(value);
      });
    }
  }
}

function rebuildProfileHome(payload) {
  if (embedTitle(payload) !== '👤 Your Profile') return payload;

  const searchRow = payload.components?.find((actionRow) =>
    actionRow?.components?.some((component) => componentId(component) === 'user:search'));
  const navigationRow = payload.components?.[payload.components.length - 1];

  const actionButtons = [
    button('user:account:record', 'Account Record', ButtonStyle.Secondary, '🗂️'),
    button('user:help', 'Help', ButtonStyle.Secondary, '❓'),
    button('user:module:notes', 'Notes', ButtonStyle.Secondary, '📌'),
    button('user:preferences', 'Preferences', ButtonStyle.Secondary, '⚙️'),
  ];

  const categories = [
    button('user:category:community', 'Community', ButtonStyle.Secondary, '🏘️'),
    button('user:category:feedback', 'Feedback', ButtonStyle.Secondary, '💬'),
    button('user:category:messages', 'Messages', ButtonStyle.Secondary, '✉️'),
    button('user:category:roles', 'Roles', ButtonStyle.Secondary, '🎭'),
    button('user:category:security', 'Security', ButtonStyle.Secondary, '🛡️'),
    button('user:category:social', 'Social', ButtonStyle.Secondary, '📣'),
    button('user:category:utility', 'Utility', ButtonStyle.Secondary, '🧰'),
  ];

  payload.components = [
    searchRow,
    row(...actionButtons),
    row(...categories.slice(0, 4)),
    row(...categories.slice(4)),
    navigationRow,
  ].filter(Boolean);

  return payload;
}

function rebuildCategoryPanel(payload) {
  const title = embedTitle(payload);
  const searchRow = payload.components?.find((actionRow) =>
    actionRow?.components?.some((component) => componentId(component) === 'user:search'));
  const navigationRow = payload.components?.[payload.components.length - 1];

  let moduleButtons = null;
  if (title === '🎭 Roles') {
    moduleButtons = [
      button('user:module:role-history', 'History', ButtonStyle.Secondary, '📜'),
      button('user:profile:roles', 'View Roles', ButtonStyle.Primary, '🎭'),
    ];
  } else if (title === '🛡️ Security') {
    moduleButtons = [
      button('user:module:security-notifications', 'Notifications', ButtonStyle.Secondary, '🔔'),
      button('user:module:verification', 'Verification', ButtonStyle.Secondary, '✅'),
    ];
  } else if (title === '📣 Social') {
    moduleButtons = [button('user:module:social', 'My Creator Profile', ButtonStyle.Success, '👤')];
  }

  if (moduleButtons) payload.components = [searchRow, row(...moduleButtons), navigationRow].filter(Boolean);
  return payload;
}

function refreshHelpPanel(payload) {
  const embed = payload?.embeds?.[0];
  if (embedTitle(payload) !== '❓ Goliath User Panel Help') return payload;

  embed.setDescription([
    'Welcome to your personal Goliath User Panel.',
    '',
    '**👤 Profile Home**',
    'Your live Discord profile, membership, progress and community summary are displayed directly on the landing panel.',
    '',
    '**📌 Personal Tools**',
    '🗂️ **Account Record** — Your warnings, cases, infractions and appeals.',
    '❓ **Help** — User Panel guidance.',
    '📌 **Notes** — Planned private personal notebook.',
    '⚙️ **Preferences** — Planned personal User Panel preferences.',
    '',
    '**📂 Categories**',
    '🏘️ **Community** — Giveaways, invites, leveling and polls.',
    '💬 **Feedback** — Forms, suggestions and tickets.',
    '✉️ **Messages** — Starboard.',
    '🎭 **Roles** — View roles and role history.',
    '🛡️ **Security** — Verification and notifications.',
    '📣 **Social** — My Creator Profile.',
    '🧰 **Utility** — Help, ping, server info, translate and future tools.',
    '',
    '**🧭 Navigation**',
    '⬅️ **Back** returns to the previous page. Multi-page menus add User Panel and page controls only when needed.',
  ].join('\n'));

  return payload;
}

function sortNonNavigationButtons(payload) {
  if (!payload || !Array.isArray(payload.components)) return payload;
  cleanSearchOptions(payload);
  refreshHelpPanel(payload);
  rebuildProfileHome(payload);
  rebuildCategoryPanel(payload);

  const finalRowIndex = payload.components.length - 1;
  const sortableRows = [];
  const sizes = [];
  const buttons = [];

  for (let index = 0; index < finalRowIndex; index += 1) {
    const actionRow = payload.components[index];
    if (!isButtonRow(actionRow)) continue;
    sortableRows.push(index);
    sizes.push(actionRow.components.length);
    buttons.push(...actionRow.components);
  }

  buttons.sort((left, right) => componentLabel(left).localeCompare(componentLabel(right), 'en', { sensitivity: 'base' }));
  let offset = 0;
  sortableRows.forEach((rowIndex, index) => {
    const size = sizes[index];
    payload.components[rowIndex] = row(...buttons.slice(offset, offset + size));
    offset += size;
  });

  return payload;
}

function buildSimpleDevelopmentPanel(interaction, title, description) {
  const name = interaction.member?.displayName || interaction.user?.username || 'Unknown User';
  return {
    embeds: [new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: `Requested by ${name}` })
      .setTimestamp()],
    components: [row(button('user:home', 'Back', ButtonStyle.Secondary, '⬅️'))],
  };
}

function buildPreferencesDevelopmentPanel(interaction) {
  return buildSimpleDevelopmentPanel(
    interaction,
    '⚙️ Preferences — Development',
    'Personal User Panel preferences will be designed and connected in a later stage.',
  );
}

function buildProfileDevelopmentPage(interaction) {
  return buildSimpleDevelopmentPanel(
    interaction,
    '🚧 User Panel Development Tools',
    'Development roadmap only. Modules remain owned by their existing APIs.',
  );
}

module.exports = {
  buildPreferencesDevelopmentPanel,
  buildProfileDevelopmentPage,
  buildSimpleDevelopmentPanel,
  sortNonNavigationButtons,
};
