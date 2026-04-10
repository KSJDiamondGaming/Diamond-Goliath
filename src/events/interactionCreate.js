const { Events } = require('discord.js');
const { handleStatsInteraction } = require('../utils/stats/statsHandlers');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // ✅ Handle stats panel interactions FIRST
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const handled = await handleStatsInteraction(interaction);
      if (handled) return;
    }

    // ✅ Then slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error in /${interaction.commandName}:`, error);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error while executing this command.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command.',
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send error response:', replyError);
      }
    }
  },
};