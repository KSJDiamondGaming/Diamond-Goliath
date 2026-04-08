const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('Set the moderation log channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel for moderation logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const dataPath = path.join(__dirname, '..', '..', 'data', 'logChannels.json');

    let logChannels = {};

    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      logChannels = raw ? JSON.parse(raw) : {};
    }

    logChannels[interaction.guild.id] = channel.id;

    fs.writeFileSync(dataPath, JSON.stringify(logChannels, null, 2));

    await interaction.reply({
      content: `✅ Moderation logs channel set to ${channel}.`,
    });
  },
};