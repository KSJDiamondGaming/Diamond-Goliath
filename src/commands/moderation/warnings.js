const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createPanelEmbed,
  createWarningEmbed,
  createDangerEmbed,
} = require('../../utils/embed/embedStyle');

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

function readCaseData() {
  ensureCaseFile();

  try {
    const raw = fs.readFileSync(caseDetailsPath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('❌ Failed to read moderation case data:', error);
    return {};
  }
}

function trimText(text, max = 4096) {
  if (!text) return 'No reason provided';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to check')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const data = readCaseData();
    const guildCases = data[interaction.guild.id] || {};

    const warningCases = Object.values(guildCases)
      .filter(
        (c) =>
          c.action === 'Warn' &&
          c.targetId === target.id
      )
      .sort((a, b) => b.caseNumber - a.caseNumber);

    if (!warningCases.length) {
      const embed = createWarningEmbed(interaction, {
        title: '⚠️ No Warnings',
        description: `${target} has no warning history 🎉`,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const activeWarnings = warningCases.filter((c) => c.cleared !== true);
    const clearedWarnings = warningCases.filter((c) => c.cleared === true);

    const description = warningCases
      .map((warn) => {
        const status = warn.cleared === true ? '🧹 Cleared' : '⚠️ Active';
        const moderator = warn.moderatorId
          ? `<@${warn.moderatorId}>`
          : (warn.moderatorTag || 'Unknown');
        const created = warn.createdAt
          ? `<t:${Math.floor(warn.createdAt / 1000)}:R>`
          : 'Unknown time';

        let line =
          `**#${warn.caseNumber}** • ${status}\n` +
          `👮 ${moderator} • ${created}\n` +
          `📝 ${warn.reason || 'No reason provided'}`;

        if (warn.cleared === true) {
          const clearedBy = warn.clearedById
            ? `<@${warn.clearedById}>`
            : (warn.clearedByTag || 'Unknown');

          line += `\n🧹 Cleared by ${clearedBy}`;

          if (warn.clearReason) {
            line += `\n📄 Clear reason: ${warn.clearReason}`;
          }
        }

        return line;
      })
      .join('\n\n');

    const embed = createPanelEmbed(interaction, {
      title: `📜 Warnings for ${target.username}`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
      description: trimText(description, 4096),
    }).addFields(
      {
        name: '⚠️ Active',
        value: `${activeWarnings.length}`,
        inline: true,
      },
      {
        name: '🧹 Cleared',
        value: `${clearedWarnings.length}`,
        inline: true,
      },
      {
        name: '📦 Total',
        value: `${warningCases.length}`,
        inline: true,
      }
    );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};