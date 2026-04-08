const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
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
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence') || null;

    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const result = canModerate({ interaction, member });
    if (!result.allowed) {
      return interaction.reply({
        content: result.message,
        ephemeral: true,
      });
    }

    let dmSent = true;

    try {
      await targetUser.send(
        `You have been warned in **${interaction.guild.name}**.\nReason: **${reason}**`
      );
    } catch {
      dmSent = false;
    }

    await interaction.reply({
      content: dmSent
        ? `✅ Warned **${targetUser.tag}**.\nReason: **${reason}**`
        : `✅ Warned **${targetUser.tag}**.\nReason: **${reason}**\n⚠️ I could not DM the user.`,
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Warn',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      color: '#f39c12',
    });
  },
};