const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logs/modlogs/moderationActionLog');
const createModCase = require('../../utils/moderation/cases/createModCase');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
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
    const target = interaction.options.getUser('user');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';
    const evidence = interaction.options.getString('evidence') || null;

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (!member) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Member Not Found',
        description: 'That member is not in this server.',
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (target.bot) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn a bot.',
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (target.id === interaction.user.id) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn yourself.',
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (target.id === interaction.client.user.id) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Invalid Target',
        description: 'You cannot warn this bot.',
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (
      interaction.member.roles.highest.position <= member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ Action Failed',
        description: 'You cannot warn a member with the same or higher role.',
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const { caseNumber } = createModCase({
      guildId: interaction.guild.id,
      action: 'Warn',
      targetUser: target,
      moderator: interaction.user,
      reason,
      evidence,
    });

    const embed = createSuccessEmbed(interaction, {
      title: '⚠️ Member Warned',
      description: `${target} has been warned successfully.`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '📁 Case',
        value: `#${caseNumber}`,
        inline: true,
      },
      {
        name: '👤 Member',
        value: `${target}\n\`${target.id}\``,
        inline: true,
      },
      {
        name: '👮 Moderator',
        value: `${interaction.user}\n\`${interaction.user.id}\``,
        inline: true,
      },
      {
        name: '📌 Action',
        value: 'Warn',
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

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    try {
      const dmEmbed = createSuccessEmbed(interaction, {
        title: `⚠️ You were warned in ${interaction.guild.name}`,
        description: 'A moderator has issued you a warning.',
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

      await target.send({ embeds: [dmEmbed] });
    } catch (error) {
      // Ignore DM failures
    }

    await logModerationAction({
      guild: interaction.guild,
      action: 'Warn',
      user: target,
      moderator: interaction.user,
      reason: evidence ? `${reason}\nEvidence: ${evidence}` : reason,
      color: '#f39c12',
      caseId: caseNumber,
    });
  },
};

