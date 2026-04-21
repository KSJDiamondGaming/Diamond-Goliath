const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const {
  enforceCommandAccess
} = require('../../utils/utility/commandAccess');

module.exports = {
  category: 'Moderation',
  help: {
    name: 'purge',
    description: 'Delete messages from a channel.',
    usage: '/purge'
  },
  access: {
    permissions: [PermissionFlagsBits.ManageMessages],
    ownerOnly: false
  },

  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages from this channel')
    .addIntegerOption(option =>
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

    const amount = interaction.options.getInteger('amount');

    const botMember = interaction.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: 'I do not have permission to manage messages in this server.',
        ephemeral: true
      });
    }

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🧹 Messages Purged')
        .setDescription(`Successfully deleted \`${deleted.size}\` message${deleted.size === 1 ? '' : 's'}.`)
        .addFields({
          name: 'Channel',
          value: `${interaction.channel}`,
          inline: true
        })
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    } catch (error) {
      console.error('Purge command error:', error);

      await interaction.reply({
        content: 'I could not delete those messages. Messages older than 14 days cannot be bulk deleted.',
        ephemeral: true
      });
    }
  }
};