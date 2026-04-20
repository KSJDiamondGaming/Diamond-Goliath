const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('🎨 Embed Studio • build stylish modular embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const { buildEmbedPanelMessage } = require('../../utils/embed/embedPanelInteraction');
      const payload = buildEmbedPanelMessage(interaction.guildId);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [payload.embed],
          components: payload.components,
        });
      } else {
        await interaction.reply({
          embeds: [payload.embed],
          components: payload.components,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error('❌ Embed command failed:', error);

      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to open the embed panel.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to open the embed panel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send embed failure response:', replyError);
      }
    }
  },
};