const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
const { canModerate } = require('../../utils/logging/ModerationChecks');

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
    .setName('tempmute')
    .setDescription('Temporarily mute a user')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to mute')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('evidence')
        .setDescription('Optional evidence link or note')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const evidence = interaction.options.getString('evidence') || null;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

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
            title: '❌ Cannot Mute Member',
            description:
              'I cannot tempmute this member. Check role hierarchy and permissions.',
          }),
        ],
        ephemeral: true,
      });
    }

    const ms = duration * 60 * 1000;
    const expiresAt = Date.now() + ms;

    try {
      const dmEmbed = createDangerEmbed(interaction, {
        title: `🔇 You were temporarily muted in ${interaction.guild.name}`,
        description: 'A moderator has restricted your communication temporarily.',
        thumbnail: interaction.guild.iconURL({ dynamic: true }) || null,
        footerText: interaction.guild.name,
      }).addFields(
        {
          name: '⏱️ Duration',
          value: formatDuration(duration),
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

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      // Ignore DM failures
    }

    await member.timeout(ms, reason);

    addPunishment({
      userId: user.id,
      guildId: interaction.guild.id,
      type: 'mute',
      expiresAt,
    });

    const embed = createSuccessEmbed(interaction, {
      title: '🔇 Temporary Mute Applied',
      description: `${user} has been temporarily muted.`,
      thumbnail: user.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '👤 Member',
        value: `${user}\n\`${user.id}\``,
        inline: true,
      },
      {
        name: '🛡️ Moderator',
        value: `${interaction.user}\n\`${interaction.user.id}\``,
        inline: true,
      },
      {
        name: '⏱️ Duration',
        value: formatDuration(duration),
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

    embed.addFields({
      name: '⌛ Expires',
      value: `<t:${Math.floor(expiresAt / 1000)}:F>`,
      inline: false,
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'Temporary Mute',
      user,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      duration: formatDuration(duration),
      color: '#f1c40f',
    });
  },
};