const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('evidence')
        .setDescription('Optional evidence link or note')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
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

    if (!member.kickable) {
      return interaction.reply({
        content: 'I cannot kick this member. Check my role position and permissions.',
        ephemeral: true,
      });
    }

    await member.kick(reason);

    await interaction.reply({
      content: `✅ Kicked **${targetUser.tag}**.\nReason: **${reason}**`,
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Kick',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      color: '#e67e22',
    });
  },
};