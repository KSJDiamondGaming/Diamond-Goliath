const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { enforceCommandAccess } = require('../../helpers/ui/commandAccess');
const { errorEmbed } = require('../../helpers/ui/embeds');
const modPanel = require('../../functions/moderation/modPanel');

module.exports = {
  category: 'Moderation',

  help: {
    name: 'mod',
    description: '🔐 Open moderation hub and staff tools.',
    usage: '/mod',
  },

  access: {
    permissions: [PermissionFlagsBits.ModerateMembers],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛡️ Open Goliath’s moderation hub and staff tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    try {
      if (!interaction.guild) {
        return await interaction.reply({
          embeds: [
            errorEmbed('This command can only be used inside a server.'),
          ],
          flags: 64,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          flags: 64,
        });
      }

      if (typeof modPanel.openModPanel === 'function') {
        return await modPanel.openModPanel(interaction);
      }

      if (typeof modPanel === 'function') {
        return await modPanel(interaction);
      }

      throw new Error('Moderation panel opener was not found.');
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;

      console.error('❌ Mod command failed:', error);

      const failurePayload = {
        embeds: [
          errorEmbed('Failed to open the moderation hub. Please try again.'),
        ],
        components: [],
      };

      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(failurePayload);
        }

        return await interaction.reply({
          ...failurePayload,
          flags: 64,
        });
      } catch (replyError) {
        console.error('❌ Failed to send mod command error response:', replyError);
      }
    }
  },
};