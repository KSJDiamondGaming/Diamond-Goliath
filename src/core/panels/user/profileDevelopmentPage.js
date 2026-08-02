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

  return {
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
  };
}

module.exports = {
  addNextButtonToProfile,
  buildProfileDevelopmentPage,
};
