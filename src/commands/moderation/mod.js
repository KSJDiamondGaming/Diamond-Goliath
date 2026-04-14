const { SlashCommandBuilder } = require('discord.js');
const { openModPanel } = require('../../utils/moderation/modPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Open the moderation panel'),

  async execute(interaction) {
    return openModPanel(interaction);
  }
};