const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/ModerationActionLog');
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
    .setName('tempban')
    .setDescription('Temporarily ban a user')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to ban')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(525600)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('evidence')
        .setDescription('Optional evidence link or note')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const evidence = interaction.options.getString('evidence') || null;

    if (user.id === interaction.user.id) {
      return interaction.reply({
        embeds: [
          createDangerEmbed(interaction, {
            title: '❌ Invalid Target',
            description: 'You cannot tempban yourself.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (user.id === interaction.client.user.id) {
      return interaction.reply({
        embeds: [
          createDangerEmbed(interaction, {
            title: '❌ Invalid Target',
            description: 'You cannot tempban this bot.',
          }),
        ],
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member) {
      if (!member.bannable) {
        return interaction.reply({
          embeds: [
            createDangerEmbed(interaction, {
              title: '❌ Cannot Ban Member',
              description:
                'I cannot tempban this member. Check my role position and permissions.',
            }),
          ],
          ephemeral: true,
        });
      }

      if (
        interaction.member.roles.highest.position <= member.roles.highest.position &&
        interaction.guild.ownerId !== interaction.user.id
      ) {
        return interaction.reply({
          embeds: [
            createDangerEmbed(interaction, {
              title: '❌ Action Failed',
              description:
                'You cannot tempban a member with the same or higher role.',
            }),
          ],
          ephemeral: true,
        });
      }
    }

    const ms = duration * 60 * 1000;
    const expiresAt = Date.now() + ms;
    const durationText = formatDuration(duration);

    try {
      const dmEmbed = createDangerEmbed(interaction, {
        title: `🔨 You were temporarily banned from ${interaction.guild.name}`,
        description: 'A moderator has removed you from the server temporarily.',
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

      await user.send({ embeds: [dmEmbed] });
    } catch (error) {
      // Ignore DM failures
    }

    await interaction.guild.members.ban(user.id, { reason });

    addPunishment({
      userId: user.id,
      guildId: interaction.guild.id,
      type: 'ban',
      expiresAt,
    });

    const { caseNumber } = createModCase({
      guildId: interaction.guild.id,
      action: 'Temporary Ban',
      targetUser: user,
      moderator: interaction.user,
      reason,
      duration: durationText,
      evidence,
    });

    const embed = createSuccessEmbed(interaction, {
      title: '🔨 Temporary Ban Applied',
      description: `${user} has been temporarily banned.`,
      thumbnail: user.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '📁 Case',
        value: `#${caseNumber}`,
        inline: true,
      },
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
        value: durationText,
        inline: true,
      },
      {
        name: '⌛ Expires',
        value: `<t:${Math.floor(expiresAt / 1000)}:F>`,
        inline: true,
      },
      {
        name: '📌 Action',
        value: 'Temporary Ban',
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
      action: 'Temporary Ban',
      user,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      duration: durationText,
      color: '#e74c3c',
      caseId: caseNumber,
    });
  },
};