const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createSuccessEmbed,
  createDangerEmbed,
  createWarningEmbed,
} = require('../../utils/embed/embedStyle');
const logModerationAction = require('../../utils/logging/ModerationActionLog');

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

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (caseData.action !== 'Warn' || caseData.targetId !== target.id) {
        const embed = createDangerEmbed(interaction, {
          title: '❌ Invalid Case',
          description: `Case **#${caseNumberInput}** is not an active warning for ${target}.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (caseData.cleared === true) {
        const embed = createWarningEmbed(interaction, {
          title: '⚠️ Already Cleared',
          description: `Case **#${caseNumberInput}** has already been cleared.`,
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
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

        return interaction.reply({ embeds: [embed], ephemeral: true });
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

    const embed = createSuccessEmbed(interaction, {
      title: '🧹 Warnings Cleared',
      description: caseNumberInput
        ? `Case **#${caseNumberInput}** has been cleared for ${target}.`
        : `All active warnings for ${target} have been cleared.`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
    }).addFields(
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