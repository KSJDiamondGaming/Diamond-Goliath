const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { buildAdminPanel } = require('../../utils/admin/adminPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🛠️ Open the all-in-one admin hub')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.displayName ||
        interaction.user?.username ||
        'Unknown User';

      const payload = buildAdminPanel(interaction.guild, memberDisplayName);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({
          ...payload,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      console.error('❌ Admin command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to open the admin panel.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to open the admin panel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send admin failure response:', replyError);
      }
    }
  },
};