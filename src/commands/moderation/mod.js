const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const { enforceCommandAccess } = require('../../utils/commandAccess');
const modPanel = require('../../interactions/moderation/modPanel');

module.exports = {
  category: 'Moderation',
  help: {
    name: 'mod',
    description: 'Open the server moderation panel.',
    usage: '/mod',
  },
  access: {
    permissions: [PermissionFlagsBits.ModerateMembers],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛡️ Moderation • open the server moderation hub'),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    try {
      if (!interaction.guild) {
        if (interaction.deferred || interaction.replied) {
          return await interaction.followUp({
            content: '❌ This command can only be used in a server.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });
      }

      await openModPanel(interaction);
    } catch (error) {
      console.error('❌ Mod command failed:', error);

      try {
        if (interaction.deferred) {
          return await interaction.editReply({
            content: '❌ Failed to open moderation hub.',
            embeds: [],
            components: [],
          });
        }

        if (interaction.replied) {
          return await interaction.followUp({
            content: '❌ Failed to open moderation hub.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return await interaction.reply({
          content: '❌ Failed to open moderation hub.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error('❌ Failed to send mod command error response:', replyError);
      }
    }
  },
};