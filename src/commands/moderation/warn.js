const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logModerationAction');

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
    const moderator = interaction.member;

    if (!member) {
      return interaction.reply({
        content: 'That user is not in this server.',
        ephemeral: true,
      });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({
        content: 'You cannot warn yourself.',
        ephemeral: true,
      });
    }

    if (member.id === interaction.client.user.id) {
      return interaction.reply({
        content: 'You cannot warn the bot.',
        ephemeral: true,
      });
    }

    if (
      member.roles.highest.position >= moderator.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      return interaction.reply({
        content: 'You cannot warn a member with the same or higher role than you.',
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
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Warn',
      target: targetUser,
      moderator: interaction.user,
      reason,
      evidence,
    });
  },
};