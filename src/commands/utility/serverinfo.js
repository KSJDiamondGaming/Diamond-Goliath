const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const { enforceCommandAccess } = require('../../utils/commandAccess');

module.exports = {
  category: 'Utility',
  help: {
    name: 'serverinfo',
    description: 'View information about this server.',
    usage: '/serverinfo'
  },
  access: {
    permissions: [],
    ownerOnly: false
  },

  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View information about this server'),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    const guild = interaction.guild;

    await guild.members.fetch();
    const owner = await guild.fetchOwner();

    const textChannels = guild.channels.cache.filter(
      channel => channel.type === ChannelType.GuildText
    ).size;

    const voiceChannels = guild.channels.cache.filter(
      channel => channel.type === ChannelType.GuildVoice
    ).size;

    const categories = guild.channels.cache.filter(
      channel => channel.type === ChannelType.GuildCategory
    ).size;

    const humans = guild.members.cache.filter(member => !member.user.bot).size;
    const bots = guild.members.cache.filter(member => member.user.bot).size;

    const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 ${guild.name} Server Info`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        {
          name: '👑 Owner',
          value: `<@${owner.id}>`,
          inline: true
        },
        {
          name: '🆔 Server ID',
          value: `\`${guild.id}\``,
          inline: true
        },
        {
          name: '📅 Created',
          value: `<t:${createdTimestamp}:F>`,
          inline: false
        },
        {
          name: '👥 Members',
          value: `Humans: \`${humans}\`\nBots: \`${bots}\``,
          inline: true
        },
        {
          name: '💬 Channels',
          value: `Text: \`${textChannels}\`\nVoice: \`${voiceChannels}\`\nCategories: \`${categories}\``,
          inline: true
        },
        {
          name: '🎭 Roles',
          value: `\`${guild.roles.cache.size}\``,
          inline: true
        }
      )
      .setFooter({ text: `${interaction.client.user.username} Server Information` })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
};