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
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const guild = interaction.guild;

      if (!guild) {
        return await safeReply(interaction, {
          content: '❌ This command can only be used in a server.',
          embeds: [],
          components: [],
        });
      }

      await guild.members.fetch();
      const owner = await guild.fetchOwner();

      const textChannels = guild.channels.cache.filter(
        (channel) => channel.type === ChannelType.GuildText
      ).size;

      const voiceChannels = guild.channels.cache.filter(
        (channel) => channel.type === ChannelType.GuildVoice
      ).size;

      const categories = guild.channels.cache.filter(
        (channel) => channel.type === ChannelType.GuildCategory
      ).size;

      const humans = guild.members.cache.filter((member) => !member.user.bot).size;
      const bots = guild.members.cache.filter((member) => member.user.bot).size;

      const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📊 ${guild.name} Server Info`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
          {
            name: '👑 Owner',
            value: `<@${owner.id}>`,
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
            value: [
              `Total: **${guild.memberCount}**`,
              `Humans: **${humans}**`,
              `Bots: **${bots}**`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '💬 Channels',
            value: [
              `Text: **${textChannels}**`,
              `Voice: **${voiceChannels}**`,
              `Categories: **${categories}**`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '🚀 Boosts',
            value: [
              `Level: **${guild.premiumTier}**`,
              `Boosts: **${guild.premiumSubscriptionCount || 0}**`,
            ].join('\n'),
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

      if (isIgnorableInteractionError(error)) {
        return;
      }

      try {
        await safeReply(interaction, {
          content: '❌ Something went wrong while fetching server info.',
          embeds: [],
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error('❌ Failed to send ServerInfo error response:', replyError);
      }
    }
  },
};

async function safeReply(interaction, payload) {
  const safePayload = {
    ...payload,
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  };

  if (interaction.deferred) {
    return await interaction.editReply(stripFlagsForEditReply(safePayload));
  }

  if (interaction.replied) {
    return await interaction.followUp({
      ...safePayload,
      flags: safePayload.flags ?? MessageFlags.Ephemeral,
    });
  }

  return await interaction.reply(safePayload);
}

function stripFlagsForEditReply(payload) {
  const { flags, ...rest } = payload;
  return rest;
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}