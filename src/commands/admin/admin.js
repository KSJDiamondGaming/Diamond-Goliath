const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const { buildAdminPanel } = require('../../functions/admin/adminPanel');
const { errorEmbed } = require('../../helpers/ui/embeds');

module.exports = {
  category: 'Admin',

  help: {
    name: 'admin',
    description: '🔏 Open admin controls and server tools.',
    usage: '/admin',
  },

  access: {
    permissions: [PermissionFlagsBits.Administrator],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🛡️ Open Goliath’s admin controls and server tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          embeds: [
            errorEmbed('This command can only be used inside a server.'),
          ],
          ephemeral: true,
        });
      }

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.displayName ||
        interaction.user?.username ||
        'Unknown User';

      const payload = buildAdminPanel(interaction.guild, memberDisplayName);

      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply(payload);
      }

      return await interaction.reply({
        ...payload,
        ephemeral: true,
      });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;

      console.error('❌ Admin command failed:', error);

      const failurePayload = {
        embeds: [
          errorEmbed('Failed to open the admin panel. Please try again.'),
        ],
        components: [],
      };

      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(failurePayload);
        }

        return await interaction.reply({
          ...failurePayload,
          ephemeral: true,
        });
      } catch (replyError) {
        console.error('❌ Failed to send admin failure response:', replyError);
      }
    }
  },
};