const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const automodPanel = require('../../utils/automod/automodPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Open the AutoMod control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      console.log('🧪 automod execute start', {
        deferred: interaction.deferred,
        replied: interaction.replied,
        id: interaction.id,
        guildId: interaction.guild?.id || null,
      });

      if (!interaction.guild) {
        await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const payload = automodPanel.buildMainPanelPayload(interaction.guild);

      await interaction.editReply(payload);
    } catch (error) {
      console.error('❌ [AUTOMOD ERROR]', error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ Failed to open the AutoMod panel.',
          embeds: [],
          components: [],
        }).catch(() => {});
      } else {
        console.warn('⚠️ Interaction expired before reply could be sent.');
      }
    }
  },
};