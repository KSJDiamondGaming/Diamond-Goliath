const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/ModerationActionLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempmute')
    .setDescription('Temporarily mute a user')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to mute')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const member = await interaction.guild.members.fetch(user.id);
    const ms = duration * 60 * 1000;

    await member.timeout(ms, reason);

    addPunishment({
      userId: user.id,
      guildId: interaction.guild.id,
      type: 'mute',
      expiresAt: Date.now() + ms
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Temporary Mute',
      user,
      moderator: interaction.user,
      reason,
      duration: `${duration} minute(s)`,
      color: '#f1c40f'
    });

    await interaction.reply({
      content: `🔇 Muted ${user.tag} for ${duration} minute(s).`,
      ephemeral: true
    });
  }
};