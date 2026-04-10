const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embedpanel')
    .setDescription('Open the advanced embed control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const {
      buildEmbedPanelMessage
    } = require('../../utils/embed/embedPanelHandler');

    const payload = buildEmbedPanelMessage(interaction.guildId, {
      selectedType: 'welcome'
    });

    await interaction.reply({
      embeds: [payload.embed],
      components: payload.components,
      ephemeral: true
    });
  }
};