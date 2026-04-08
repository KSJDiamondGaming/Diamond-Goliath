const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const logModerationAction = require('../../utils/logging/logModerationAction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('evidence')
        .setDescription('Optional evidence link or note')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

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
        content: 'You cannot ban yourself.',
        ephemeral: true,
      });
    }

    if (member.id === interaction.client.user.id) {
      return interaction.reply({
        content: 'You cannot ban the bot.',
        ephemeral: true,
      });
    }

    if (
      member.roles.highest.position >= moderator.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      return interaction.reply({
        content: 'You cannot ban a member with the same or higher role than you.',
        ephemeral: true,
      });
    }

    if (!member.bannable) {
      return interaction.reply({
        content: 'I cannot ban this member. Check my role position and permissions.',
        ephemeral: true,
      });
    }

    await member.ban({ reason });

    await interaction.reply({
      content: `✅ Banned **${targetUser.tag}**.\nReason: **${reason}**`,
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Ban',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      color: '#e74c3c',
    });
  },
};