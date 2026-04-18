const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { setGuildConfig } = require('../../utils/config/guildConfigStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmodlog')
    .setDescription('📋 Logs • set the moderation log channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('📋 Logs • select the channel for moderation logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    setGuildConfig(interaction.guild.id, {
      modLogChannelId: channel.id
    });

    await interaction.reply({
      content: `✅ Moderation log channel set to ${channel}.`,
      ephemeral: true
    });
  }
};