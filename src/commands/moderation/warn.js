const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const {
  createSuccessEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logging/modlogs/moderationActionLog');
const createModCase = require('../../utils/logging/cases/createModCase');

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('⚠️ Warn • issue a warning to a member')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('👤 User • select the member to warn')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('📝 Reason • why you are warning this member')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('evidence')
        .setDescription('📎 Evidence • optional proof or link')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return await interaction.reply({
          content: '❌ This command can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
      }

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

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (target.bot) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Invalid Target',
          description: 'You cannot warn a bot.',
        });

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (target.id === interaction.user.id) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Invalid Target',
          description: 'You cannot warn yourself.',
        });

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (target.id === interaction.client.user.id) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Invalid Target',
          description: 'You cannot warn this bot.',
        });

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (
        interaction.member.roles.highest.position <= member.roles.highest.position &&
        interaction.guild.ownerId !== interaction.user.id
      ) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Action Failed',
          description: 'You cannot warn a member with the same or higher role.',
        });

        return await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
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

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });

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
      } catch {
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
    } catch (error) {
      if (isIgnorableInteractionError(error)) return;

      console.error('❌ Warn command failed:', error);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Failed to warn that member.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.reply({
            content: '❌ Failed to warn that member.',
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (replyError) {
        if (isIgnorableInteractionError(replyError)) return;

        console.error('❌ Failed to send warn failure response:', replyError);
      }
    }
  },
};