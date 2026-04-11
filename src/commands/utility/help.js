const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createPanelEmbed } = require('../../utils/embed/embedStyle');

const CATEGORY_STYLES = {
  admin: {
    name: '🛠️ Admin',
    emoji: '🛠️',
  },
  moderation: {
    name: '🛡️ Moderation',
    emoji: '🚨',
  },
  utility: {
    name: '📦 Utility',
    emoji: '✨',
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all commands'),

  async execute(interaction) {
    const commandsRoot = path.join(__dirname, '..');

    const categories = fs
      .readdirSync(commandsRoot)
      .filter((entry) => {
        const entryPath = path.join(commandsRoot, entry);
        return fs.statSync(entryPath).isDirectory();
      })
      .sort((a, b) => {
        const order = ['admin', 'moderation', 'utility'];
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);

        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;

        return aIndex - bIndex;
      });

    const embed = createPanelEmbed(interaction, {
      title: '📖 KSJ Goliath Command Panel',
      description: 'Use the sections below to view all available commands ✨',
      thumbnail: interaction.client.user.displayAvatarURL({ dynamic: true }),
    });

    for (const category of categories) {
      const categoryPath = path.join(commandsRoot, category);

      const files = fs
        .readdirSync(categoryPath)
        .filter((file) => file.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b));

      if (!files.length) continue;

      const style = CATEGORY_STYLES[category] || {
        name: `📂 ${category.charAt(0).toUpperCase()}${category.slice(1)}`,
        emoji: '🔹',
      };

      const lines = [];

      for (const file of files) {
        const command = require(path.join(categoryPath, file));

        if (!command?.data || typeof command.execute !== 'function') continue;

        lines.push(
          `${style.emoji} \`/${command.data.name}\` — ${command.data.description}`
        );
      }

      if (!lines.length) continue;

      embed.addFields({
        name: style.name,
        value: lines.join('\n'),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};