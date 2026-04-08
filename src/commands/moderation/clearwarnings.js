const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildEmbed = require('../../utils/buildEmbed');
const logModerationAction = require('../../utils/logging/ModerationActionLog');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear warnings for a member')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user whose warnings to clear')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('case')
        .setDescription('Specific case number to clear')
        .setRequired(false)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for clearing warnings')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const caseNumberInput = interaction.options.getInteger('case');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    const caseDetailsPath = path.join(
      __dirname,
      '..',
      '..',
      'data',
      'modCaseDetails.json'
    );

    const data = readJson(caseDetailsPath);

    if (!data[interaction.guild.id]) {
      data[interaction.guild.id] = {};
    }

    const guildCases = data[interaction.guild.id];
    let cleared = 0;
    const clearedAt = Date.now();

    if (caseNumberInput) {
      const caseData = guildCases[caseNumberInput];

      if (!caseData) {
        return interaction.reply({
          content: `❌ Case #${caseNumberInput} not found.`,
          ephemeral: true,
        });
      }

      if (caseData.action !== 'Warn' || caseData.targetId !== target.id) {
        return interaction.reply({
          content: `❌ Case #${caseNumberInput} is not a warning for this user.`,
          ephemeral: true,
        });
      }

      if (caseData.cleared === true) {
        return interaction.reply({
          content: `⚠️ Case #${caseNumberInput} is already cleared.`,
          ephemeral: true,
        });
      }

      caseData.cleared = true;
      caseData.clearedAt = clearedAt;
      caseData.clearedById = interaction.user.id;
      caseData.clearedByTag = interaction.user.tag;
      caseData.clearReason = reason;

      cleared = 1;
    } else {
      const activeWarnings = Object.values(guildCases).filter(
        (c) =>
          c.action === 'Warn' &&
          c.targetId === target.id &&
          c.cleared !== true
      );

      if (activeWarnings.length === 0) {
        return interaction.reply({
          content: `✅ ${target.tag} has no active warnings to clear.`,
          ephemeral: true,
        });
      }

      for (const caseData of activeWarnings) {
        caseData.cleared = true;
        caseData.clearedAt = clearedAt;
        caseData.clearedById = interaction.user.id;
        caseData.clearedByTag = interaction.user.tag;
        caseData.clearReason = reason;
        cleared++;
      }
    }

    writeJson(caseDetailsPath, data);

    const embed = buildEmbed(interaction.guild.id, {
      title: '🧹 Warnings Cleared',
      description: caseNumberInput
        ? `Case **#${caseNumberInput}** has been cleared for **${target.tag}**.`
        : `All active warnings for **${target.tag}** have been cleared.`,
      thumbnail: target.displayAvatarURL({ forceStatic: false }),
      fields: [
        {
          name: '👤 Target',
          value: `${target.tag}\n\`${target.id}\``,
          inline: true,
        },
        {
          name: '🛡️ Moderator',
          value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
          inline: true,
        },
        {
          name: '📌 Cleared',
          value: `${cleared}`,
          inline: true,
        },
        {
          name: '📝 Reason',
          value: reason,
          inline: false,
        },
      ],
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    await logModerationAction({
      guild: interaction.guild,
      action: 'ClearWarnings',
      user: target,
      moderator: interaction.user,
      reason: caseNumberInput
        ? `Cleared case #${caseNumberInput}. Reason: ${reason}`
        : `Cleared ${cleared} warning(s). Reason: ${reason}`,
      color: '#2ecc71',
    });
  },
};