const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const { enforceCommandAccess } = require('../../utils/utility/commandAccess');
const { openModPanel } = require('../../utils/moderation/modPanel');

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
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return await openModPanel(interaction);
    } catch (error) {
      console.error('❌ Mod command failed:', error);

      return interaction.reply({
        content: '❌ Failed to open moderation hub.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};