const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const logModerationAction = require('../../utils/logs/moderationActionLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages from this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const targetUser = interaction.options.getUser('user');
    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || !channel.messages) {
      return interaction.reply({
        content: 'This command can only be used in a text channel.',
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      if (!targetUser) {
        const deleted = await channel.bulkDelete(amount, true);

        if (!deleted.size) {
          return interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('Nothing Deleted')
                .setDescription(
                  'No messages could be deleted. Messages older than 14 days cannot be bulk deleted.'
                )
                .setTimestamp()
            ]
          });
        }

        await logModerationAction({
          guild: interaction.guild,
          action: 'Purge',
          moderator: interaction.user,
          reason: 'Bulk message purge',
          color: '#FEE75C',
          details: [
            {
              name: 'Channel',
              value: `${channel}`,
              inline: false
            },
            {
              name: 'Messages Deleted',
              value: `${deleted.size}`,
              inline: true
            }
          ]
        });

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🧹 Messages Purged')
              .setDescription(`Deleted **${deleted.size}** message(s) from ${channel}.`)
              .setTimestamp()
          ]
        });
      }

      const fetched = await channel.messages.fetch({ limit: 100 });

      const userMessages = fetched
        .filter(msg => msg.author.id === targetUser.id)
        .first(amount);

      if (!userMessages.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Nothing Found')
              .setDescription(`No recent messages from **${targetUser.tag}** were found in ${channel}.`)
              .setTimestamp()
          ]
        });
      }

      const deleted = await channel.bulkDelete(userMessages, true);

      if (!deleted.size) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Nothing Deleted')
              .setDescription(
                `Messages from **${targetUser.tag}** were found, but none could be deleted. They may all be older than 14 days.`
              )
              .setTimestamp()
          ]
        });
      }

      await logModerationAction({
        guild: interaction.guild,
        action: 'User Purge',
        user: targetUser,
        moderator: interaction.user,
        reason: 'Targeted message purge',
        color: '#FEE75C',
        details: [
          {
            name: 'Channel',
            value: `${channel}`,
            inline: false
          },
          {
            name: 'Messages Deleted',
            value: `${deleted.size}`,
            inline: true
          }
        ]
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('🧹 Messages Purged')
            .setDescription(`Deleted **${deleted.size}** message(s) from **${targetUser.tag}** in ${channel}.`)
            .setTimestamp()
        ]
      });
    } catch (error) {
      console.error('❌ Error running /purge:', error);

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Error')
            .setDescription('There was a problem trying to purge messages.')
            .setTimestamp()
        ]
      });
    }
  }
};

