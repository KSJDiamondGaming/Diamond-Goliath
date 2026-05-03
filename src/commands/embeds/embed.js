const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { errorEmbed } = require('../../helpers/ui/embeds');
const { buildEmbedPanel } = require('../../functions/embed/embedPanel');

module.exports = {
  category: 'Embeds',

  help: {
    name: 'embed',
    description: '🎨 Open embed studio and builder tools.',
    usage: '/embed',
  },

  access: {
    permissions: [PermissionFlagsBits.ManageGuild],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('🎨 Open Goliath’s embed studio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          embeds: [errorEmbed('This command can only be used inside a server.')],
          ephemeral: true,
        });
      }

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.displayName ||
        interaction.user?.username ||
        'Unknown User';

      return await interaction.reply({
        ...buildEmbedPanel(interaction, memberDisplayName),
        ephemeral: true,
      });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;

      console.error('❌ Embed command failed:', error);

      const failurePayload = {
        embeds: [errorEmbed('Failed to open the embed panel. Please try again.')],
        components: [],
      };

      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply(failurePayload);
      }

      return await interaction.reply({
        ...failurePayload,
        ephemeral: true,
      });
    }
  },
};