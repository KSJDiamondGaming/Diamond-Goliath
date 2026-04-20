const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const { setGuildConfig } = require('../../utils/config/guildConfigStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmodlog')
    .setDescription('📋 Logs • set the moderation log channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('📋 Logs • select the channel for moderation logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.options.getChannel('channel');

      setGuildConfig(interaction.guild.id, {
        modLogChannelId: channel.id,
      });

      await interaction.reply({
        content: `✅ Moderation log channel set to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      console.error('❌ SetModLog command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to update the moderation log channel.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to update the moderation log channel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send setmodlog failure response:', replyError);
      }
    }
  },
};