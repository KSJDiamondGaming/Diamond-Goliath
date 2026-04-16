const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),

  async execute(interaction) {
    console.log('🏓 PING EXECUTE', {
      pid: process.pid,
      id: interaction.id,
      deferred: interaction.deferred,
      replied: interaction.replied,
      createdTimestamp: interaction.createdTimestamp,
      now: Date.now(),
      ageMs: Date.now() - interaction.createdTimestamp,
    });

    try {
      try {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        await interaction.editReply({
          content: '🏓 Pong!',
        });
      } catch (error) {
        console.error('❌ ping defer failed:', error);

        if (error?.code === 10062) {
          await new Promise(resolve => setTimeout(resolve, 750));

          await interaction.editReply({
            content: '🏓 Pong! (Discord likely acknowledged despite 10062)',
          });
          return;
        }

        throw error;
      }
    } catch (error) {
      console.error('❌ /ping final error:', error);
    }
  },
};