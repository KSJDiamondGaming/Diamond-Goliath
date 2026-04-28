const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} = require('discord.js');

const {
  enforceCommandAccess,
} = require('../../../bot/utils/commandAccess')

module.exports = {
  category: 'Moderation',
  help: {
    name: 'purge',
    description: 'Delete messages from a channel.',
    usage: '/purge',
  },
  access: {
    permissions: [PermissionFlagsBits.ManageMessages],
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages from this channel')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const denied = await enforceCommandAccess(interaction, module.exports, BOT_OWNER_ID);
    if (denied) return;

    try {
      if (!interaction.guild) {
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const channel = interaction.channel;

      if (!channel) {
        return await interaction.reply({
          content: '❌ I could not find this channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const allowedChannelTypes = [
        ChannelType.GuildText,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      ];

      if (!allowedChannelTypes.includes(channel.type)) {
        return await interaction.reply({
          content: '❌ This command can only be used in text channels or threads.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const amount = interaction.options.getInteger('amount');

      const botMember =
        interaction.guild.members.me ||
        (await interaction.guild.members.fetchMe().catch(() => null));

      if (!botMember) {
        return await interaction.reply({
          content: '❌ I could not verify my permissions in this server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return await interaction.reply({
          content: '❌ I do not have permission to manage messages in this server.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (
        'permissionsFor' in channel &&
        !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageMessages)
      ) {
        return await interaction.reply({
          content: '❌ I do not have permission to manage messages in this channel.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const deleted = await channel.bulkDelete(amount, true);

      if (!deleted.size) {
        return await interaction.reply({
          content: '⚠️ No messages were deleted. They may all be older than 14 days.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🧹 Messages Purged')
        .setDescription(
          `Successfully deleted \`${deleted.size}\` message${deleted.size === 1 ? '' : 's'}.`
        )
        .addFields(
          {
            name: 'Channel',
            value: `${channel}`,
            inline: true,
          },
          {
            name: 'Moderator',
            value: `${interaction.user}`,
            inline: true,
          }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return;
      }

      console.error('❌ Purge command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content:
              '❌ I could not delete those messages. Messages older than 14 days cannot be bulk deleted.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content:
              '❌ I could not delete those messages. Messages older than 14 days cannot be bulk deleted.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        console.error('❌ Failed to send purge failure response:', replyError);
      }
    }
  },
};