const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Help panel • browse all commands and features'),

  async execute(interaction) {
    await interaction.reply({
      content: '✅ Help command reached successfully.',
      flags: 64,
    });
  },
};