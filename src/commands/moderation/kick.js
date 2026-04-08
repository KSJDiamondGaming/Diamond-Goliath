const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logModerationAction');

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
    const moderator = interaction.member;

    if (!member) {
      return interaction.reply({
        content: 'That user is not in this server.',
        ephemeral: true,
      });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({
        content: 'You cannot kick yourself.',
        ephemeral: true,
      });
    }

    if (member.id === interaction.client.user.id) {
      return interaction.reply({
        content: 'You cannot kick the bot.',
        ephemeral: true,
      });
    }

    if (
      member.roles.highest.position >= moderator.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      return interaction.reply({
        content: 'You cannot kick a member with the same or higher role than you.',
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
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Kick',
      target: targetUser,
      moderator: interaction.user,
      reason,
      evidence,
    });
  },
};