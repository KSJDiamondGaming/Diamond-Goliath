const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { enforceCommandAccess } = require('../../ui/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const modPanel = require('./modPanel');

module.exports = {
  category: 'Moderation',

  help: {
    name: 'mod',
    description: '🔐 Open moderation hub and staff tools.',
    usage: '/mod',
  },

  access: {
    level: 'mod',
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and staff tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    try {
      if (!interaction.guild) {
        return await safeReply(interaction, {
          embeds: [
            errorEmbed('This command can only be used inside a server.'),
          ],
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 });
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

      return await safeReply(interaction, {
        embeds: [
          errorEmbed('Failed to open the moderation hub. Please try again.'),
        ],
        components: [],
      });
    }
  },
};

async function safeReply(interaction, payload) {
  const safePayload = {
    ...payload,
    flags: 64,
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(safePayload);
  }

  return interaction.reply(safePayload);
}
