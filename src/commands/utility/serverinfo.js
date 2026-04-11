const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { createPanelEmbed } = require('../../utils/embed/embedStyle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('View information about this server'),

  async execute(interaction) {
    const guild = interaction.guild;

    await guild.members.fetch();
    const owner = await guild.fetchOwner();

    const textChannels = guild.channels.cache.filter(
      (c) =>
        c.type === ChannelType.GuildText ||
        c.type === ChannelType.GuildAnnouncement ||
        c.type === ChannelType.PublicThread ||
        c.type === ChannelType.PrivateThread ||
        c.type === ChannelType.AnnouncementThread
    ).size;

    const voiceChannels = guild.channels.cache.filter(
      (c) =>
        c.type === ChannelType.GuildVoice ||
        c.type === ChannelType.GuildStageVoice
    ).size;

    const categories = guild.channels.cache.filter(
      (c) => c.type === ChannelType.GuildCategory
    ).size;

    const humans = guild.members.cache.filter((m) => !m.user.bot).size;
    const bots = guild.members.cache.filter((m) => m.user.bot).size;

    const embed = createPanelEmbed(interaction, {
      title: `📊 ${guild.name} Server Info`,
      thumbnail: guild.iconURL({ dynamic: true }),
    })
      .addFields(
        {
          name: '👑 Owner',
          value: `**<@${owner.id}>**`,
          inline: true,
        },
        {
          name: '🆔 Guild',
          value: guild.id,
          inline: true,
        },
        {
          name: '📅 Created',
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
        {
          name: '👥 Members',
          value: `Total: ${guild.memberCount}\nHumans: ${humans}\nBots: ${bots}`,
          inline: true,
        },
        {
          name: '💬 Channels',
          value: `Text: ${textChannels}\nVoice: ${voiceChannels}\nCategories: ${categories}`,
          inline: true,
        },
        {
          name: '🚀 Boost Level',
          value: `Level ${guild.premiumTier}\nBoosts: ${guild.premiumSubscriptionCount || 0}`,
          inline: true,
        }
      );

    await interaction.reply({ embeds: [embed] });
  },
};