const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const automodPanel = require('../../utils/automod/automodPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('⚙️ AutoMod control • manage filters & protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        const payload = {
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
        return;
      }

      const payload = automodPanel.buildMainPanelPayload(interaction.guild);

      if (interaction.replied || interaction.deferred) {
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

      console.error('❌ AutoMod command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to open the AutoMod panel.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to open the AutoMod panel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send automod failure response:', replyError);
      }
    }
  },
};