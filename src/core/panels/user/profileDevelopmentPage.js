'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const REMOVED_CUSTOM_IDS = new Set([
  'user:category:account',
  'user:module:reputation',
]);

function button(customId, label, style = ButtonStyle.Secondary, emoji = null) {
  const component = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) component.setEmoji(emoji);
  return component;
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function isButtonRow(actionRow) {
  return Array.isArray(actionRow?.components)
    && actionRow.components.length > 0
    && actionRow.components.every((component) => component?.data?.type === 2);
}

function componentCustomId(component) {
  return component?.data?.custom_id || component?.data?.customId || component?.customId || null;
}

function componentLabel(component) {
  return String(component?.data?.label || component?.label || '');
}

function stripRemovedControls(payload) {
  if (!Array.isArray(payload?.components)) return payload;

  payload.components = payload.components
    .map((actionRow) => {
      if (!Array.isArray(actionRow?.components)) return actionRow;

      actionRow.components = actionRow.components.filter((component) => {
        const customId = componentCustomId(component);
        const label = componentLabel(component);

        // Preserve navigation buttons even when their old destination used the removed Account route.
        if (REMOVED_CUSTOM_IDS.has(customId) && label !== 'Back') return false;

        if (customId === 'user:search' && Array.isArray(component.options)) {
          component.options = component.options.filter((option) => {
            const value = option?.data?.value || option?.value;
            return value !== 'reputation';
          });
        }

        return true;
      });

      return actionRow;
    })
    .filter((actionRow) => Array.isArray(actionRow?.components) && actionRow.components.length > 0);

  return payload;
}

function normaliseNavigation(payload) {
  if (!Array.isArray(payload?.components) || !payload.components.length) return payload;

  let finalRow = payload.components[payload.components.length - 1];
  if (!isButtonRow(finalRow)) return payload;

  const components = [...finalRow.components];
  const hasPagedControl = components.some((component) => {
    const customId = String(componentCustomId(component) || '');
    const label = componentLabel(component);
    return customId.includes(':page:') || ['Next', 'Previous'].includes(label);
  });

  let nextComponents = components;
  const hasBack = nextComponents.some((component) => componentLabel(component) === 'Back');
  const hasUserPanel = nextComponents.some((component) => componentLabel(component) === 'User Panel');

  if (!hasBack) {
    nextComponents.unshift(button('user:home', 'Back', ButtonStyle.Secondary, '⬅️'));
  }

  if (hasPagedControl) {
    if (!hasUserPanel && nextComponents.length < 5) {
      const insertIndex = Math.min(1, nextComponents.length);
      nextComponents.splice(insertIndex, 0, button('user:home', 'User Panel', ButtonStyle.Secondary, '🏠'));
    }
  } else {
    nextComponents = nextComponents.filter((component) => componentLabel(component) !== 'User Panel');
  }

  finalRow = row(...nextComponents.slice(0, 5));
  payload.components[payload.components.length - 1] = finalRow;
  return payload;
}

function sortNonNavigationButtons(payload) {
  stripRemovedControls(payload);
  normaliseNavigation(payload);
  if (!Array.isArray(payload?.components) || payload.components.length < 2) return payload;

  const finalRowIndex = payload.components.length - 1;
  const sortableIndexes = [];
  const rowSizes = [];
  const buttons = [];

  for (let index = 0; index < finalRowIndex; index += 1) {
    const actionRow = payload.components[index];
    if (!isButtonRow(actionRow)) continue;
    sortableIndexes.push(index);
    rowSizes.push(actionRow.components.length);
    buttons.push(...actionRow.components);
  }

  buttons.sort((left, right) => componentLabel(left).localeCompare(
    componentLabel(right),
    'en',
    { sensitivity: 'base' },
  ));

  let offset = 0;
  sortableIndexes.forEach((rowIndex, position) => {
    const size = rowSizes[position];
    payload.components[rowIndex] = row(...buttons.slice(offset, offset + size));
    offset += size;
  });

  return payload;
}

function addNextButtonToProfile(payload) {
  sortNonNavigationButtons(payload);
  const finalRow = payload?.components?.[payload.components.length - 1];
  if (!finalRow?.components || finalRow.components.length >= 5) return payload;
  finalRow.addComponents(button('user:profile:page:2', 'Next', ButtonStyle.Primary, '➡️'));
  normaliseNavigation(payload);
  return payload;
}

function buildProfileDevelopmentPage(interaction) {
  const memberDisplayName = interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';

  const embed = new EmbedBuilder()
    .setColor('#FEE75C')
    .setTitle('🚧 User Panel Development Tools')
    .setDescription([
      'These buttons expose the agreed User Panel sections while development is in progress.',
      '',
      'They are navigation and presentation controls only. Planned sections continue to open their development placeholders until their existing module APIs are connected.',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName} • Page 2 of 2` })
    .setTimestamp();

  return sortNonNavigationButtons({
    embeds: [embed],
    components: [
      row(
        button('user:module:forms', 'Forms', ButtonStyle.Secondary, '📝'),
        button('user:module:giveaways', 'Giveaways', ButtonStyle.Success, '🎉'),
        button('user:module:invites', 'Invites', ButtonStyle.Secondary, '📨'),
        button('user:module:leveling', 'Leveling', ButtonStyle.Secondary, '🏆'),
      ),
      row(
        button('user:module:polls', 'Polls', ButtonStyle.Secondary, '📊'),
        button('user:module:profile-settings', 'Profile Settings', ButtonStyle.Secondary, '👤'),
        button('user:module:roles', 'Roles', ButtonStyle.Secondary, '🎭'),
        button('user:module:security', 'Security', ButtonStyle.Secondary, '🛡️'),
      ),
      row(
        button('user:module:social', 'Social Studio', ButtonStyle.Success, '📣'),
        button('user:module:starboard', 'Starboard', ButtonStyle.Secondary, '⭐'),
        button('user:module:suggestions', 'Suggestions', ButtonStyle.Secondary, '💡'),
        button('user:module:tickets', 'Tickets', ButtonStyle.Secondary, '🎫'),
      ),
      row(button('user:category:utility', 'Utility', ButtonStyle.Secondary, '🧰')),
      row(
        button('user:home', 'Back', ButtonStyle.Secondary, '⬅️'),
        button('user:profile:page:2', 'Refresh', ButtonStyle.Success, '🔄'),
        button('user:in-progress:0', 'In Progress', ButtonStyle.Secondary, '🚧'),
      ),
    ],
  });
}

module.exports = {
  addNextButtonToProfile,
  buildProfileDevelopmentPage,
  normaliseNavigation,
  sortNonNavigationButtons,
  stripRemovedControls,
};
