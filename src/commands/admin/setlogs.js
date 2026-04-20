const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('📋 Logs • set the moderation log channel')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('📋 Logs • The channel for moderation logs')
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
      const dataDir = path.join(__dirname, '..', '..', 'data');
      const dataPath = path.join(dataDir, 'logChannels.json');

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      let logChannels = {};

      if (fs.existsSync(dataPath)) {
        try {
          const raw = fs.readFileSync(dataPath, 'utf8');
          logChannels = raw ? JSON.parse(raw) : {};
        } catch (error) {
          console.error('❌ Failed to read logChannels.json:', error);
          logChannels = {};
        }
      }

      logChannels[interaction.guild.id] = channel.id;
      fs.writeFileSync(dataPath, JSON.stringify(logChannels, null, 2));

      await interaction.reply({
        content: `✅ Moderation logs channel set to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      console.error('❌ SetLogs command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to update the logs channel.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to update the logs channel.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send setlogs failure response:', replyError);
      }
    }
  },
};