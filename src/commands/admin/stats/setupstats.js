const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  buildStatsSetupMessage,
} = require('../../../utils/stats/statsHandlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupstats')
    .setDescription('Open the stats setup menu')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply(buildStatsSetupMessage(interaction.guild));
  },
};