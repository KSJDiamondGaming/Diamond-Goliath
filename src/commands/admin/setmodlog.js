const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { setGuildConfig } = require('../../utils/guildConfigStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmodlog')
    .setDescription('Set the moderation log channel for this server')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to use for moderation logs')
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
      flags: MessageFlags.Ephemeral
    });
  }
};