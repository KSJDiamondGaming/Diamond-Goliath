const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('📊 Server Info • view server stats and information'),

  async execute(interaction) {
    try {
      const guild = interaction.guild;

      if (!guild) {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply({
            content: '❌ This command can only be used in a server.',
            embeds: [],
            components: [],
          });
        }

        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      await guild.members.fetch();
      const owner = await guild.fetchOwner();

      const textChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      ).size;

      const voiceChannels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildVoice
      ).size;

      const categories = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory
      ).size;

      const humans = guild.members.cache.filter((m) => !m.user.bot).size;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;

      const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📊 ${guild.name} Server Info`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          {
            name: '👑 Owner',
            value: `${owner}`,
            inline: true,
          },
          {
            name: '🆔 Server ID',
            value: `\`${guild.id}\``,
            inline: true,
          },
          {
            name: '📅 Created',
            value: `<t:${createdTimestamp}:F>`,
            inline: false,
          },
          {
            name: '👥 Members',
            value: `Total: **${guild.memberCount}**\nHumans: **${humans}**\nBots: **${bots}**`,
            inline: true,
          },
          {
            name: '💬 Channels',
            value: `Text: **${textChannels}**\nVoice: **${voiceChannels}**\nCategories: **${categories}**`,
            inline: true,
          },
          {
            name: '🚀 Boosts',
            value: `Level: **${guild.premiumTier}**\nBoosts: **${guild.premiumSubscriptionCount || 0}**`,
            inline: true,
          }
        )
        .setFooter({
          text: `Requested by ${interaction.member?.displayName || interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

      await interaction.editReply({
        content: '',
        embeds: [embed],
      });
    } catch (error) {
      console.error('❌ ServerInfo Error:', error);

      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Something went wrong while fetching server info.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Something went wrong while fetching server info.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send ServerInfo error response:', replyError);
      }
    }
  },
};