const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

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
    const reason =
      interaction.options.getString('reason') || 'No reason provided';
    const evidence = interaction.options.getString('evidence') || null;

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    const result = canModerate({ interaction, member });

    if (!result.allowed) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Action Failed',
        description: result.message,
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (!member) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Member Not Found',
        description: 'That member could not be found in this server.',
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (!member.bannable) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Cannot Ban Member',
        description:
          'I cannot ban this member. Check my role position and permissions.',
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    try {
      const dmEmbed = createDangerEmbed(interaction, {
        title: `🔨 You were banned from ${interaction.guild.name}`,
        description: 'A moderator has removed you from the server.',
        thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
        footerText: interaction.guild.name,
      }).addFields({
        name: '📝 Reason',
        value: trimText(reason),
        inline: false,
      });

      if (evidence) {
        dmEmbed.addFields({
          name: '📎 Evidence',
          value: trimText(evidence),
          inline: false,
        });
      }

      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      // Ignore DM failures
    }

    await member.ban({ reason });

    const embed = createSuccessEmbed(interaction, {
      title: '🔨 Member Banned',
      description: `${targetUser} has been banned successfully.`,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '👤 Member',
        value: `${targetUser}\n\`${targetUser.id}\``,
        inline: true,
      },
      {
        name: '🛡️ Moderator',
        value: `${interaction.user}\n\`${interaction.user.id}\``,
        inline: true,
      },
      {
        name: '📌 Action',
        value: 'Ban',
        inline: true,
      },
      {
        name: '📝 Reason',
        value: trimText(reason),
        inline: false,
      }
    );

    if (evidence) {
      embed.addFields({
        name: '📎 Evidence',
        value: trimText(evidence),
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
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