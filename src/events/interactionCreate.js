const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
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
          });
        } else {
          await interaction.reply({
            content: 'There was an error while executing this command.',
            flags: 64,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send error response:', replyError);
      }
    }
  },
};