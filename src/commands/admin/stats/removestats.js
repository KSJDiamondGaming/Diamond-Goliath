const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const stats = require('../../../utils/stats/statsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removestats')
    .setDescription('Remove server stats channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const res = await stats.remove(interaction.guild);

    await interaction.editReply({ content: res.msg });
  },
};