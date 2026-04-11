const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  createPanelEmbed,
  createWarningEmbed,
} = require('../../utils/embed/embedStyle');

const warningsPath = path.join(__dirname, '../../data/warnings.json');

function getWarnings() {
  if (!fs.existsSync(warningsPath)) return {};
  return JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
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
    const warningsData = getWarnings();

    const userWarnings = warningsData[target.id] || [];

    // ❌ No warnings
    if (!userWarnings.length) {
      const embed = createWarningEmbed(interaction, {
        title: '⚠️ No Warnings',
        description: `${target} has no warnings 🎉`,
        thumbnail: target.displayAvatarURL({ dynamic: true }),
      });

      return interaction.reply({ embeds: [embed] });
    }

    // ✅ Has warnings
    const embed = createPanelEmbed(interaction, {
      title: `📜 Warnings for ${target.username}`,
      thumbnail: target.displayAvatarURL({ dynamic: true }),
    });

    const formatted = userWarnings
      .map((warn, i) => {
        return `**#${i + 1}** — ${warn.reason || 'No reason provided'}\n👮 <@${warn.moderator}> • <t:${Math.floor(warn.timestamp / 1000)}:R>`;
      })
      .join('\n\n');

    embed.setDescription(formatted);

    await interaction.reply({ embeds: [embed] });
  },
};