const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const {
  buildDashboardPayload
} = require('../../utils/moderation/modPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open moderation panel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const payload = await buildDashboardPayload(interaction, null, 'overview');

      return interaction.editReply({
        ...payload
      });
    } catch (err) {
      console.error('MOD PANEL ERROR:', err);

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: '❌ Failed to open mod panel.'
        });
      }

      return interaction.reply({
        content: '❌ Failed to open mod panel.',
        ephemeral: true
      });
    }
  }
};