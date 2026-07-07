'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const serverCopy = require('../../modules/serverCopy/serverCopy');
const serverCopyAnalyse = require('../../modules/serverCopy/serverCopyAnalyse');

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('copy')
        .setDescription('Copy as much of one server into another as Discord allows.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('analyse')
        .setDescription('Analyse source and destination before using server copy.')
        .addStringOption((option) =>
          option
            .setName('source_server')
            .setDescription('Source server ID to analyse.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('destination_server')
            .setDescription('Destination server ID to analyse.')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options?.getSubcommand?.(false);

    if (subcommand === 'copy') {
      return serverCopy.start(interaction);
    }

    if (subcommand === 'analyse') {
      return serverCopyAnalyse.run(interaction);
    }

    return interaction.reply({
      content: '❌ Unknown internal server option.',
      flags: 64,
    });
  },
};
