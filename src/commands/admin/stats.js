const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildStatsSetupMessage } = require('../../utils/stats/statsUI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Open the stats setup menu')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply(buildStatsSetupMessage(interaction.guild));
  },
};