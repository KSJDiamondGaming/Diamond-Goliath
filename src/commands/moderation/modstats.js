const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createPanelEmbed,
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

function trimText(text, max = 1024) {
  if (!text) return 'No data';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function countByAction(cases, action) {
  return cases.filter((c) => c.action === action).length;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('View moderation statistics for this server')
    .addIntegerOption(option =>
      option
        .setName('recent')
        .setDescription('How many recent cases to show')
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(15)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const recentLimit = interaction.options.getInteger('recent') || 5;
    const data = readCaseData();
    const guildCases = data[interaction.guild.id] || {};
    const allCases = Object.values(guildCases).sort(
      (a, b) => (b.caseNumber || 0) - (a.caseNumber || 0)
    );

    if (!allCases.length) {
      const embed = createDangerEmbed(interaction, {
        title: '❌ No Moderation Data',
        description: 'No moderation cases were found for this server.',
      });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const warnCount = countByAction(allCases, 'Warn');
    const banCount = countByAction(allCases, 'Ban');
    const kickCount = countByAction(allCases, 'Kick');
    const timeoutCount = countByAction(allCases, 'Timeout');
    const clearWarningsCount = countByAction(allCases, 'ClearWarnings');
    const tempBanCount = countByAction(allCases, 'Temporary Ban');
    const tempMuteCount = countByAction(allCases, 'Temporary Mute');

    const activeWarnings = allCases.filter(
      (c) => c.action === 'Warn' && c.cleared !== true
    ).length;
    const clearedWarnings = allCases.filter(
      (c) => c.action === 'Warn' && c.cleared === true
    ).length;

    const moderatorMap = new Map();

    for (const modCase of allCases) {
      const moderatorId = modCase.moderatorId || 'unknown';
      const moderatorTag = modCase.moderatorTag || 'Unknown Moderator';

      if (!moderatorMap.has(moderatorId)) {
        moderatorMap.set(moderatorId, {
          id: moderatorId,
          tag: moderatorTag,
          total: 0,
        });
      }

      moderatorMap.get(moderatorId).total++;
    }

    const topModerators = [...moderatorMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topModeratorsText = topModerators.length
      ? topModerators
          .map((mod, index) => {
            const label =
              mod.id !== 'unknown' ? `<@${mod.id}>` : mod.tag;
            return `**${index + 1}.** ${label} — ${mod.total}`;
          })
          .join('\n')
      : 'No moderator data';

    const recentCasesText = allCases
      .slice(0, recentLimit)
      .map((c) => {
        const target = c.targetTag || c.targetId || 'Unknown Target';
        return `**#${c.caseNumber}** • ${c.action} • ${target}\n<t:${Math.floor((c.createdAt || Date.now()) / 1000)}:R>`;
      })
      .join('\n\n');

    const embed = createPanelEmbed(interaction, {
      title: '📊 Moderation Statistics',
      description: `Overview for **${interaction.guild.name}**`,
      thumbnail: interaction.guild.iconURL({ dynamic: true }),
    }).addFields(
      {
        name: '📦 Total Cases',
        value: `${allCases.length}`,
        inline: true,
      },
      {
        name: '⚠️ Active Warns',
        value: `${activeWarnings}`,
        inline: true,
      },
      {
        name: '🧹 Cleared Warns',
        value: `${clearedWarnings}`,
        inline: true,
      },
      {
        name: '⚠️ Warns',
        value: `${warnCount}`,
        inline: true,
      },
      {
        name: '🔨 Bans',
        value: `${banCount}`,
        inline: true,
      },
      {
        name: '👢 Kicks',
        value: `${kickCount}`,
        inline: true,
      },
      {
        name: '⏱️ Timeouts',
        value: `${timeoutCount}`,
        inline: true,
      },
      {
        name: '🧹 Clear Actions',
        value: `${clearWarningsCount}`,
        inline: true,
      },
      {
        name: '🔨 Temp Bans',
        value: `${tempBanCount}`,
        inline: true,
      },
      {
        name: '🔇 Temp Mutes',
        value: `${tempMuteCount}`,
        inline: true,
      },
      {
        name: '🏆 Top Moderators',
        value: trimText(topModeratorsText),
        inline: false,
      },
      {
        name: `🕘 Recent ${recentLimit} Cases`,
        value: trimText(recentCasesText),
        inline: false,
      }
    );

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};