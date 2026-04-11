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
const createModCase = require('../../utils/moderation/createModCase');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minute(s)`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) return `${hours} hour(s)`;
  return `${hours}h ${mins}m`;
}

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

    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    const result = canModerate({ interaction, member });

    if (!result.allowed) {
      return interaction.reply({
        embeds: [
          createDangerEmbed(interaction, {
            title: '❌ Action Failed',
            description: result.message,
          }),
        ],
        ephemeral: true,
      });
    }

    if (!member) {
      return interaction.reply({
        embeds: [
          createDangerEmbed(interaction, {
            title: '❌ Member Not Found',
            description: 'That member could not be found in this server.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        embeds: [
          createDangerEmbed(interaction, {
            title: '❌ Cannot Timeout Member',
            description:
              'I cannot timeout this member. Check my role position and permissions.',
          }),
        ],
        ephemeral: true,
      });
    }

    const durationMs = minutes * 60 * 1000;
    const durationText = formatDuration(minutes);

    try {
      const dmEmbed = createDangerEmbed(interaction, {
        title: `⏱️ You were timed out in ${interaction.guild.name}`,
        description: 'A moderator has restricted your communication.',
        thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
        footerText: interaction.guild.name,
      }).addFields(
        {
          name: '⏱️ Duration',
          value: durationText,
          inline: true,
        },
        {
          name: '📝 Reason',
          value: trimText(reason),
          inline: false,
        }
      );

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

    await member.timeout(durationMs, reason);

    const { caseNumber } = createModCase({
      guildId: interaction.guild.id,
      action: 'Timeout',
      targetUser,
      moderator: interaction.user,
      reason,
      duration: durationText,
      evidence,
    });

    const embed = createSuccessEmbed(interaction, {
      title: '⏱️ Member Timed Out',
      description: `${targetUser} has been timed out successfully.`,
      thumbnail: targetUser.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '📁 Case',
        value: `#${caseNumber}`,
        inline: true,
      },
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
        name: '⏱️ Duration',
        value: durationText,
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
      action: 'Timeout',
      user: targetUser,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      duration: durationText,
      color: '#f39c12',
      caseId: caseNumber,
    });
  },
};