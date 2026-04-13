const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require('discord.js');

const {
  buildDashboardPayload
} = require('../../utils/moderation/modPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open moderation panel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.BanMembers
    ),

  async execute(interaction) {
    const payload = await buildDashboardPayload(interaction, null, 'overview');

    return interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral
    });
  }
};