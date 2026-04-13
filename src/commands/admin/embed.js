const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Open the stylish modular embed studio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const {buildEmbedPanelMessage,} = require('../../utils/embed/embedPanelInteraction');
    const payload = buildEmbedPanelMessage(interaction.guildId);

    await interaction.reply({
      embeds: [payload.embed],
      components: payload.components,
      flags: MessageFlags.Ephemeral,
    });
  },
};