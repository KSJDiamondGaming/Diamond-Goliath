const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const stats = require('../../../utils/stats/statsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removestats')
    .setDescription('Remove all stats channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const result = await stats.removeAllStatChannels(interaction.guild);

    await interaction.reply({
      content: result.msg,
      ephemeral: true,
    });
  },
};