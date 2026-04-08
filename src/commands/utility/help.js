const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all commands'),

  async execute(interaction) {
    const commandsRoot = path.join(__dirname, '..');
    const categories = fs.readdirSync(commandsRoot);

    let helpMessage = '📖 **KSJ Goliath Commands**\n\n';

    for (const category of categories) {
      const categoryPath = path.join(commandsRoot, category);

      if (!fs.statSync(categoryPath).isDirectory()) continue;

      const files = fs.readdirSync(categoryPath).filter((file) => file.endsWith('.js'));

      if (files.length === 0) continue;

      helpMessage += `**${category.toUpperCase()}**\n`;

      for (const file of files) {
        const command = require(path.join(categoryPath, file));

        if (!command.data || !command.execute) continue;

        helpMessage += `• /${command.data.name} - ${command.data.description}\n`;
      }

      helpMessage += '\n';
    }

    await interaction.reply({ content: helpMessage });
  },
};