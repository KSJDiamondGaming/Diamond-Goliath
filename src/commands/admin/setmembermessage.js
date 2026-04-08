const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildEmbed = require('../../utils/buildEmbed');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getDefaults(type) {
  return {
    welcome: {
      title: '👋 Welcome!',
      message: 'Welcome {user} to **{server}**! You are member **#{membercount}**.',
    },
    leave: {
      title: '👋 Goodbye!',
      message: '{username} has left **{server}**. We now have **{membercount}** members.',
    },
  }[type];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setmembermessage')
    .setDescription('Configure welcome and leave member messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(sub =>
      sub
        .setName('welcome-channel')
        .setDescription('Set the welcome channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel for welcome messages')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('welcome-title')
        .setDescription('Set the welcome embed title')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Use {user}, {username}, {server}, {membercount}')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('welcome-message')
        .setDescription('Set the welcome embed message')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Use {user}, {username}, {server}, {membercount}')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('welcome-preview')
        .setDescription('Preview the welcome embed')
    )

    .addSubcommand(sub =>
      sub
        .setName('leave-channel')
        .setDescription('Set the leave channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('The channel for leave messages')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('leave-title')
        .setDescription('Set the leave embed title')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Use {user}, {username}, {server}, {membercount}')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('leave-message')
        .setDescription('Set the leave embed message')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Use {user}, {username}, {server}, {membercount}')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName('leave-preview')
        .setDescription('Preview the leave embed')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    const channelPath = (type) =>
      path.join(__dirname, '..', '..', 'data', `${type}Channels.json`);
    const titlePath = (type) =>
      path.join(__dirname, '..', '..', 'data', `${type}Titles.json`);
    const messagePath = (type) =>
      path.join(__dirname, '..', '..', 'data', `${type}Messages.json`);

    const getType = () => (sub.startsWith('welcome-') ? 'welcome' : 'leave');
    const type = getType();

    if (sub.endsWith('channel')) {
      const channel = interaction.options.getChannel('channel');
      const data = readJson(channelPath(type));
      data[interaction.guild.id] = channel.id;
      writeJson(channelPath(type), data);

      return interaction.reply({
        content: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} channel set to ${channel}.`,
      });
    }

    if (sub.endsWith('title')) {
      const text = interaction.options.getString('text');
      const data = readJson(titlePath(type));
      data[interaction.guild.id] = text;
      writeJson(titlePath(type), data);

      return interaction.reply({
        content: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} title updated.`,
      });
    }

    if (sub.endsWith('message')) {
      const text = interaction.options.getString('text');
      const data = readJson(messagePath(type));
      data[interaction.guild.id] = text;
      writeJson(messagePath(type), data);

      return interaction.reply({
        content: `✅ ${type.charAt(0).toUpperCase() + type.slice(1)} message updated.`,
      });
    }

    if (sub.endsWith('preview')) {
      const titles = readJson(titlePath(type));
      const messages = readJson(messagePath(type));
      const defaults = getDefaults(type);

      const title = titles[interaction.guild.id] || defaults.title;
      const message = messages[interaction.guild.id] || defaults.message;

      const embed = buildEmbed(interaction.guild.id, {
        title,
        description: message,
        thumbnail: interaction.user.displayAvatarURL({ forceStatic: false }),
        placeholders: {
          user: type === 'welcome' ? `${interaction.user}` : interaction.user.tag,
          username: interaction.user.username,
          server: interaction.guild.name,
          membercount: interaction.guild.memberCount,
        },
        fields: [
          {
            name: 'Member Count',
            value: '{membercount}',
            inline: true,
          },
        ],
      });

      return interaction.reply({
        embeds: [embed],
      });
    }
  },
};