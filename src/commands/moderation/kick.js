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

    if (!member.kickable) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Cannot Kick Member',
        description:
          'I cannot kick this member. Check my role position and permissions.',
      });

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }

    try {
      const dmEmbed = createDangerEmbed(interaction, {
        title: `👢 You were kicked from ${interaction.guild.name}`,
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

    await member.kick(reason);

    const embed = createSuccessEmbed(interaction, {
      title: '👢 Member Kicked',
      description: `${targetUser} has been kicked successfully.`,
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
        value: 'Kick',
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
      action: 'Kick',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      color: '#e67e22',
    });
  },
};