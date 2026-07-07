'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('export')
        .setDescription('Export a server into this guild JSON as a reusable template.')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Template display name.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('source_server')
            .setDescription('Source server ID. Defaults to current server.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('template_id')
            .setDescription('Optional stable template ID.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('version')
            .setDescription('Template version. Defaults to 1.0.0.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Short template description.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('build')
        .setDescription('Build/deploy a saved server template into a destination server.')
        .addStringOption((option) =>
          option
            .setName('destination_server')
            .setDescription('Optional destination server ID. Defaults to current server.')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options?.getSubcommand?.(false);

    if (subcommand === 'copy') return serverCopy.start(interaction);
    if (subcommand === 'analyse') return serverCopy.analyse(interaction);
    if (subcommand === 'export') return serverCopy.exportTemplate(interaction);
    if (subcommand === 'build') return serverCopy.startBuild(interaction);

    return interaction.reply({
      content: '❌ Unknown internal server option.',
      flags: 64,
    });
  },
};
