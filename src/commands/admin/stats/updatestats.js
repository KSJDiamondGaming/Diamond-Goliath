const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const stats = require('../../../utils/stats/statsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updatestats')
    .setDescription('Force update all stat channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const result = await stats.updateAllStatChannels(interaction.guild);

    await interaction.reply({
      content: result.msg,
      ephemeral: true,
    });
  },
};