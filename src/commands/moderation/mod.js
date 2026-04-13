const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
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
  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const payload = await buildDashboardPayload(interaction, null, 'overview');

    return interaction.editReply(payload);
  } catch (err) {
    console.error('MOD PANEL ERROR:', err);

    const errorPayload = {
      content: '❌ Failed to open mod panel.',
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorPayload);
      } else {
        await interaction.reply(errorPayload);
      }
    } catch (e) {
      // prevent crash if Discord rejects second response
    }
  }
}
};