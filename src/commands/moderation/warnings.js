const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createPanelEmbed,
  createWarningEmbed,
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

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function buildButtons(page, totalPages, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`warnings_first_${userId}`)
      .setLabel('≪')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`warnings_prev_${userId}`)
      .setLabel('‹')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`warnings_page_${userId}`)
      .setLabel(`${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`warnings_next_${userId}`)
      .setLabel('›')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`warnings_last_${userId}`)
      .setLabel('≫')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1)
  );
}

function buildWarningLine(warn) {
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
}

function createWarningsEmbed(interaction, target, warningCases, page, totalPages) {
  const activeWarnings = warningCases.filter((c) => c.cleared !== true);
  const clearedWarnings = warningCases.filter((c) => c.cleared === true);

  const pageItems = chunkArray(warningCases, 5)[page];
  const description = pageItems.map(buildWarningLine).join('\n\n');

  return createPanelEmbed(interaction, {
    title: `📜 Warnings for ${target.username}`,
    thumbnail: target.displayAvatarURL({ dynamic: true }),
    description,
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
    },
    {
      name: '📄 Page',
      value: `${page + 1}/${totalPages}`,
      inline: true,
    }
  );
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
      .filter((c) => c.action === 'Warn' && c.targetId === target.id)
      .sort((a, b) => b.caseNumber - a.caseNumber);

    if (!warningCases.length) {
      const embed = createWarningEmbed(interaction, {
        title: '⚠️ No Warnings',
        description: `${target} has no warning history 🎉`,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
      });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const pages = chunkArray(warningCases, 5);
    let page = 0;

    const embed = createWarningsEmbed(
      interaction,
      target,
      warningCases,
      page,
      pages.length
    );

    const components =
      pages.length > 1 ? [buildButtons(page, pages.length, interaction.user.id)] : [];

    const response = await interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });

    if (pages.length <= 1) return;

    const collector = response.createMessageComponentCollector({
      time: 120000,
    });

    collector.on('collect', async (buttonInteraction) => {
      if (buttonInteraction.user.id !== interaction.user.id) {
        return buttonInteraction.reply({
          content: '❌ You cannot use these buttons.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (buttonInteraction.customId === `warnings_first_${interaction.user.id}`) {
        page = 0;
      } else if (buttonInteraction.customId === `warnings_prev_${interaction.user.id}`) {
        page = Math.max(0, page - 1);
      } else if (buttonInteraction.customId === `warnings_next_${interaction.user.id}`) {
        page = Math.min(pages.length - 1, page + 1);
      } else if (buttonInteraction.customId === `warnings_last_${interaction.user.id}`) {
        page = pages.length - 1;
      }

      await buttonInteraction.update({
        embeds: [
          createWarningsEmbed(
            interaction,
            target,
            warningCases,
            page,
            pages.length
          ),
        ],
        components: [buildButtons(page, pages.length, interaction.user.id)],
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({
          components: [],
        });
      } catch (error) {
        // Ignore edit errors after expiry/deletion
      }
    });
  },
};