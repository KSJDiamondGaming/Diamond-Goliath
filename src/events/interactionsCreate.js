module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: 'That command could not be found.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: 'That command could not be found.',
        ephemeral: true,
      });
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName}`, error);

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
    }
  },
};