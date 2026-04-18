const { SlashCommandBuilder } = require('discord.js');
const { openModPanel } = require('../../utils/moderation/modPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🛡️ Moderation panel • manage server moderation tools'),

  async execute(interaction) {
    return openModPanel(interaction);
  }
};