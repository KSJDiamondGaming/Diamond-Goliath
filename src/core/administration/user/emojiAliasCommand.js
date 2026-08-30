'use strict';

const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const emojisUserPanel = require('../../../modules/utilityStudio/emojis/emojisUserPanel');

module.exports = {
  category: 'Utility',
  help: {
    name: 'e',
    description: 'Quickly find, use, or post Goliath emojis.',
    usage: '/e [find] [message]',
  },
  access: {
    ownerOnly: false,
  },
  data: new SlashCommandBuilder()
    .setName('e')
    .setDescription('Quickly find, use, or post Goliath emojis')
    .addStringOption((option) => option
      .setName('find')
      .setDescription('Search Goliath Core and this server\'s Emoji Studio emojis')
      .setAutocomplete(true)
      .setRequired(false))
    .addStringOption((option) => option
      .setName('message')
      .setDescription('Post a normal message with :emoji: shortcodes converted by Goliath')
      .setMaxLength(1900)
      .setRequired(false))
    .setDMPermission(false),

  async autocomplete(interaction) {
    return emojisUserPanel.autocomplete(interaction);
  },

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    try {
      if (!interaction.guild) {
        return interaction.reply({ content: 'This command can only be used inside a server.', flags: MessageFlags.Ephemeral });
      }

      const message = interaction.options.getString('message');
      const emojiId = interaction.options.getString('find');

      if (message && emojiId) {
        return interaction.reply({
          content: 'Use either **find** for one emoji or **message** for a full message, not both at once.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (message) {
        const result = await emojisUserPanel.resolveMessageText(interaction, message);
        if (!result.changed) {
          return interaction.reply({
            content: 'No available Emoji Studio shortcodes were found. Try something like `:discord:`, `:youtube:` or `:twitch:`.',
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          content: result.resolved,
          allowedMentions: { parse: [] },
        });
      }

      if (emojiId) {
        const selection = await emojisUserPanel.commandSelection(interaction, emojiId);
        if (!selection) {
          return interaction.reply({ content: 'That emoji is no longer available in this server.', flags: MessageFlags.Ephemeral });
        }
        return interaction.reply(selection);
      }

      return interaction.reply({ ...(await emojisUserPanel.buildPanel(interaction)), flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('Emoji alias command failed:', error);
      const payload = { content: 'Failed to open Emoji Studio. Please try again.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
      return interaction.reply(payload);
    }
  },
};
