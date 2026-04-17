module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing /${interaction.commandName}:`, error);

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ There was an error while executing this command.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ There was an error while executing this command.',
            ephemeral: true,
          });
        }
      } catch (err) {
        console.error('❌ Failed to send interaction error response:', err);
      }
    }
  },
};