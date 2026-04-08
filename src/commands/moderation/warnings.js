const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildEmbed = require('../../utils/buildEmbed');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warning history for a member')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to check')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('target');

    const caseDetailsPath = path.join(
      __dirname,
      '..',
      '..',
      'data',
      'modCaseDetails.json'
    );

    const data = readJson(caseDetailsPath);
    const guildCases = data[interaction.guild.id] || {};

    const allWarnings = Object.values(guildCases)
      .filter(c => c.action === 'Warn' && c.targetId === target.id)
      .sort((a, b) => b.caseNumber - a.caseNumber);

    const activeWarnings = allWarnings.filter(c => c.cleared !== true);
    const clearedWarnings = allWarnings.filter(c => c.cleared === true);

    if (allWarnings.length === 0) {
      return interaction.reply({
        content: `✅ ${target.tag} has no warning history.`,
        ephemeral: true,
      });
    }

    const description = allWarnings
      .slice(0, 15)
      .map(c => {
        const status = c.cleared === true ? '🧹 Cleared' : '⚠️ Active';
        return `**#${c.caseNumber}** • ${status}\nReason: ${c.reason}\n<t:${Math.floor(c.createdAt / 1000)}:R>`;
      })
      .join('\n\n')
      .slice(0, 4096);

    const embed = buildEmbed(interaction.guild.id, {
      title: `⚠️ Warning History for ${target.tag}`,
      description,
      thumbnail: target.displayAvatarURL({ forceStatic: false }),
      fields: [
        {
          name: 'Active Warnings',
          value: `${activeWarnings.length}`,
          inline: true,
        },
        {
          name: 'Cleared Warnings',
          value: `${clearedWarnings.length}`,
          inline: true,
        },
        {
          name: 'Total Warnings',
          value: `${allWarnings.length}`,
          inline: true,
        },
      ],
    });

    await interaction.reply({
      embeds: [embed],
    });
  },
};