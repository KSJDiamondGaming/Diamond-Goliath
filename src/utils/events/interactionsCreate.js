const { Events, MessageFlags } = require('discord.js');
const { handleStatsInteraction } = require('../utils/stats/statsHandlers');
const { handleEmbedPanelInteraction } = require('../utils/embed/embedPanelHandler');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const handledStats = await handleStatsInteraction(interaction);
        if (handledStats) return;
      }

      const isEmbedPanelInteraction =
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        (typeof interaction.isChannelSelectMenu === 'function' && interaction.isChannelSelectMenu()) ||
        interaction.isModalSubmit();

      if (isEmbedPanelInteraction) {
        try {
          const handledEmbed = await handleEmbedPanelInteraction(interaction);
          if (handledEmbed) return;
        } catch (error) {
          console.error('❌ Embed panel interaction error:', error);

          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'There was an error while using the embed panel.',
              flags: MessageFlags.Ephemeral,
            }).catch(() => null);
          } else {
            await interaction.followUp({
              content: 'There was an error while using the embed panel.',
              flags: MessageFlags.Ephemeral,
            }).catch(() => null);
          }

          return;
        }
      }

      if (!interaction.isChatInputCommand()) return;

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error in interaction handler:`, error);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this interaction.',
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this interaction.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send error response:', replyError);
      }
    }
  },
};