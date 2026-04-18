const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createSuccessEmbed,
  createDangerEmbed,
  createWarningEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logging/modlogs/moderationActionLog');
const createModCase = require('../../utils/logging/cases/createModCase');

const caseDetailsPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'modCaseDetails.json'
);

function ensureCaseFile() {
  const dir = path.dirname(caseDetailsPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(caseDetailsPath)) {
    fs.writeFileSync(caseDetailsPath, JSON.stringify({}, null, 2));
  }
}

function readJson() {
  ensureCaseFile();

  const raw = fs.readFileSync(caseDetailsPath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(data) {
  ensureCaseFile();
  fs.writeFileSync(caseDetailsPath, JSON.stringify(data, null, 2));
}

function trimText(text, max = 1024) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('🧹 Warnings • clear warnings for a member')

    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('👤 Target • select the user to clear warnings for')
        .setRequired(true)
    )

    .addIntegerOption(option =>
      option
        .setName('case')
        .setDescription('🔢 Case • specific warning case number to clear')
        .setRequired(false)
        .setMinValue(1)
    )

    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('📝 Reason • why the warnings are being cleared')
        .setRequired(false)
    )

    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const caseNumberInput = interaction.options.getInteger('case');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    const data = readJson();

    if (!data[interaction.guild.id]) {
      data[interaction.guild.id] = {};
    }

    const guildCases = data[interaction.guild.id];
    let cleared = 0;
    const clearedAt = Date.now();

    if (caseNumberInput) {
      const caseData = guildCases[caseNumberInput];

      if (!caseData) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Case Not Found',
          description: `Case **#${caseNumberInput}** was not found.`,
        });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (caseData.action !== 'Warn' || caseData.targetId !== target.id) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Invalid Case',
          description: `Case **#${caseNumberInput}** is not a warning for ${target}.`,
        });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (caseData.cleared === true) {
        const embed = createWarningEmbed(interaction, {
          title: '⚠️ Already Cleared',
          description: `Case **#${caseNumberInput}** has already been cleared.`,
        });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
        const embed = createWarningEmbed(interaction, {
          title: '⚠️ No Active Warnings',
          description: `${target} has no active warnings to clear.`,
          thumbnail: target.displayAvatarURL({ dynamic: true }),
        });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

    writeJson(data);

    const clearReasonText = caseNumberInput
      ? `Cleared warning case #${caseNumberInput}. ${reason}`
      : `Cleared ${cleared} active warning(s). ${reason}`;

    const { caseNumber } = createModCase({
      guildId: interaction.guild.id,
      action: 'ClearWarnings',
      targetUser: target,
      moderator: interaction.user,
      reason: clearReasonText,
    });

    const embed = createSuccessEmbed(interaction, {
      title: '🧹 Warnings Cleared',
      description: caseNumberInput
        ? `Case **#${caseNumberInput}** has been cleared for ${target}.`
        : `All active warnings for ${target} have been cleared.`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
    }).addFields(
      {
        name: '📁 Case',
        value: `#${caseNumber}`,
        inline: true,
      },
      {
        name: '👤 Target',
        value: `${target}\n\`${target.id}\``,
        inline: true,
      },
      {
        name: '🛡️ Moderator',
        value: `${interaction.user}\n\`${interaction.user.id}\``,
        inline: true,
      },
      {
        name: '📌 Cleared',
        value: `${cleared}`,
        inline: true,
      },
      {
        name: '📝 Reason',
        value: trimText(reason),
        inline: false,
      }
    );

    if (caseNumberInput) {
      embed.addFields({
        name: '🔎 Cleared Warning Case',
        value: `#${caseNumberInput}`,
        inline: true,
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
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
      caseId: caseNumber,
    });
  },
};