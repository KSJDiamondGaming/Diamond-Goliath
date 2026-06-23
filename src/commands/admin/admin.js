const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const { buildAdminPanel } = require('../../modules/admin/functions/adminPanel');
const { errorEmbed } = require('../../helpers/ui/embeds');
const { enforceCommandAccess } = require('../../helpers/ui/commandAccess');

module.exports = {
  category: 'Admin',

  help: {
    name: 'admin',
    description: '🔏 Open admin controls and server tools.',
    usage: '/admin',
  },

  access: {
    level: 'admin',
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🔏 Open Goliath’s admin controls and server tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, module.exports);
    if (denied) return;

    try {
      if (!interaction.guild) {
        return await safeReply(interaction, {
          embeds: [errorEmbed('This command can only be used inside a server.')],
        });
      }

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.displayName ||
        interaction.user?.username ||
        'Unknown User';

      const payload = buildAdminPanel(interaction.guild, memberDisplayName);

      return await safeReply(interaction, payload);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;

      console.error('❌ Admin command failed:', error);

      return await safeReply(interaction, {
        embeds: [errorEmbed('Failed to open the admin panel. Please try again.')],
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
