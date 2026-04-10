const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const stats = require('../../../utils/stats/statsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updatestats')
    .setDescription('Force update server stats')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await stats.update(interaction.guild);

    await interaction.reply({
      content: 'Stats updated.',
      ephemeral: true,
    });
  },
};