const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { buildMainPanelPayload } = require('../../utils/automod/automodPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Open the AutoMod control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const payload = buildMainPanelPayload(interaction.guild);

    await interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });
  },
};