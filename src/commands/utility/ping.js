const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows the bot latency'),

  async execute(interaction) {
    let replied = false;

    try {
      const reply = await interaction.reply({
        content: '🏓 Pong!',
        ephemeral: true,
        fetchReply: true
      });

      replied = true;

      const apiPing = reply.createdTimestamp - interaction.createdTimestamp;
      const wsPing = interaction.client.ws.ping;

      await interaction.editReply(
        `🏓 Pong!\n📡 API Latency: ${apiPing}ms\n💓 WebSocket: ${wsPing}ms`
      );

    } catch (error) {
      console.error('❌ /ping error:', error);

      try {
        // Only respond if we actually can
        if (!interaction.replied && !interaction.deferred && !replied) {
          await interaction.reply({
            content: '❌ Failed to run /ping.',
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: '❌ Failed to run /ping.',
            ephemeral: true
          });
        }
      } catch (err) {
        console.error('❌ Failed to send ping error response:', err);
      }
    }
  }
};