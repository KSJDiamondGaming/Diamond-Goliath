const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View information about this server'),

  async execute(interaction) {
    const guild = interaction.guild;

    await guild.members.fetch();

    const owner = await guild.fetchOwner();

    const textChannels = guild.channels.cache.filter(
      c =>
        c.type === ChannelType.GuildText ||
        c.type === ChannelType.GuildAnnouncement ||
        c.type === ChannelType.PublicThread ||
        c.type === ChannelType.PrivateThread ||
        c.type === ChannelType.AnnouncementThread
    ).size;

    const voiceChannels = guild.channels.cache.filter(
      c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
    ).size;

    const categories = guild.channels.cache.filter(
      c => c.type === ChannelType.GuildCategory
    ).size;

    const humans = guild.members.cache.filter(m => !m.user.bot).size;
    const bots = guild.members.cache.filter(m => m.user.bot).size;

    const requesterName = interaction.member?.displayName || interaction.user.username;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📊 ${guild.name} Server Info`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .addFields(
        {
          name: '👑 Owner',
          value: `**<@${owner.id}>**`,
          inline: true
        },
        {
          name: '🆔 Guild',
          value: guild.id,
          inline: true
        },
        {
          name: '📅 Created',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false
        },
        {
          name: '👥 Members',
          value: `Total: ${guild.memberCount}\nHumans: ${humans}\nBots: ${bots}`,
          inline: true
        },
        {
          name: '💬 Channels',
          value: `Text: ${textChannels}\nVoice: ${voiceChannels}\nCategories: ${categories}`,
          inline: true
        },
        {
          name: '🚀 Boost Level',
          value: `Level ${guild.premiumTier}\nBoosts: ${guild.premiumSubscriptionCount || 0}`,
          inline: true
        }
      )
      .setFooter({
        text: `Requested by ${requesterName}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};