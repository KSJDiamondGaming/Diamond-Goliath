const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('🧹 Purge • delete messages from a channel')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('🔢 Amount • number of messages to delete (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.editReply({
          content: '❌ You do not have permission to use this command.',
        });
      }

      const botMember =
        interaction.guild.members.me ??
        await interaction.guild.members.fetchMe();

      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.editReply({
          content: '❌ I need the **Manage Messages** permission to do that.',
        });
      }

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await interaction.editReply({
        content: `🧹 Deleted **${deleted.size}** message(s).`,
      });
    } catch (error) {
  if (error?.code === 10062 || error?.code === 40060) return;

  console.error('❌ /purge error:', error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ Something went wrong while trying to purge messages.',
        }).catch(() => {});
      }
    }
  },
};