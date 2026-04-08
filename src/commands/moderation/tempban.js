const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/logModerationAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to ban')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const ms = duration * 60 * 1000;

    await interaction.guild.members.ban(user.id, { reason });

    addPunishment({
      userId: user.id,
      guildId: interaction.guild.id,
      type: 'ban',
      expiresAt: Date.now() + ms
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Temporary Ban',
      user,
      moderator: interaction.user,
      reason,
      duration: `${duration} minute(s)`,
      color: '#e74c3c'
    });

    await interaction.reply({
      content: `🔨 Banned ${user.tag} for ${duration} minute(s).`,
      ephemeral: true
    });
  }
};