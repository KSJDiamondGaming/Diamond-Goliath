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
    if (!interaction.guild) {
      const payload = {
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
      return;
    }

    const payload = automodPanel.buildMainPanelPayload(interaction.guild);

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};