const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member from the server')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to timeout')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('minutes')
        .setDescription('Timeout duration in minutes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the timeout')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('evidence')
        .setDescription('Optional evidence link or note')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const evidence = interaction.options.getString('evidence') || null;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const result = canModerate({ interaction, member });
    if (!result.allowed) {
      return interaction.reply({
        content: result.message,
        ephemeral: true,
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        content: 'I cannot timeout this member. Check my role position and permissions.',
        ephemeral: true,
      });
    }

    const durationMs = minutes * 60 * 1000;

    await member.timeout(durationMs, reason);

    await interaction.reply({
      content: `✅ Timed out **${targetUser.tag}** for **${minutes} minute(s)**.\nReason: **${reason}**`,
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Timeout',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      duration: `${minutes} minute(s)`,
      color: '#f39c12',
    });
  },
};