'use strict';

const { SlashCommandBuilder } = require('discord.js');
const serverCopy = require('../../modules/serverCopy/serverCopy');

module.exports = {
  hidden: true,
  category: 'Admin',
  devOnly: false,

  access: {
    ownerOnly: true,
  },

  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Internal server developer tools.')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('copy')
        .setDescription('Copy as much of one server into another as Discord allows.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options?.getSubcommand?.(false);

    if (subcommand === 'copy') {
      return serverCopy.start(interaction);
    }

    return interaction.reply({
      content: '❌ Unknown internal server option.',
      flags: 64,
    });
  },
};
