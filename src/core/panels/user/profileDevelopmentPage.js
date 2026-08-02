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

function isButtonRow(actionRow) {
  return Array.isArray(actionRow?.components)
    && actionRow.components.length > 0
    && actionRow.components.every((component) => component?.data?.type === 2);
}

function sortNonNavigationButtons(payload) {
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

  if (buttons.length < 2) return payload;

  buttons.sort((left, right) => String(left?.data?.label || '').localeCompare(
    String(right?.data?.label || ''),
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
  const finalRow = payload?.components?.[payload.components.length - 1];
  if (!finalRow?.components || finalRow.components.length >= 5) return payload;
  finalRow.addComponents(button('user:profile:page:2', 'Next', ButtonStyle.Primary, '➡️'));
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
        button('user:module:giveaways', 'Giveaways', ButtonStyle.Success, '🎉'),
        button('user:module:invites', 'Invites', ButtonStyle.Secondary, '📨'),
        button('user:module:leveling', 'Leveling', ButtonStyle.Secondary, '🏆'),
        button('user:module:polls', 'Polls', ButtonStyle.Secondary, '📊'),
      ),
      row(
        button('user:module:forms', 'Forms', ButtonStyle.Secondary, '📝'),
        button('user:module:suggestions', 'Suggestions', ButtonStyle.Secondary, '💡'),
        button('user:module:tickets', 'Tickets', ButtonStyle.Secondary, '🎫'),
        button('user:module:starboard', 'Starboard', ButtonStyle.Secondary, '⭐'),
      ),
      row(
        button('user:module:roles', 'Roles', ButtonStyle.Secondary, '🎭'),
        button('user:module:security', 'Security', ButtonStyle.Secondary, '🛡️'),
        button('user:module:social', 'Social Studio', ButtonStyle.Success, '📣'),
        button('user:module:profile-settings', 'Profile Settings', ButtonStyle.Secondary, '👤'),
      ),
      row(
        button('user:category:utility', 'Utility', ButtonStyle.Secondary, '🧰'),
      ),
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
  sortNonNavigationButtons,
};
