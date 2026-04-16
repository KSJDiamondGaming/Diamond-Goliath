module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      console.log('🟦 INTERACTION EVENT FIRED');
      console.log('🟦 Type:', interaction.type);
      console.log('🟦 Command:', interaction.commandName || 'N/A');
      console.log('🟦 Custom ID:', interaction.customId || 'N/A');
      console.log('🕒 Interaction age:', Date.now() - interaction.createdTimestamp, 'ms');
      console.log('🆔 PID:', process.pid);

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.log(`⚠️ Command not found: ${interaction.commandName}`);
        return;
      }

      await command.execute(interaction, client);
    } catch (error) {
      console.error('❌ interactionCreate error:', error);
    }
  }
};