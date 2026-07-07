'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const duplicator = require('../../modules/duplicator/duplicator');

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
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Choose what to do.')
        .setRequired(true)
        .addChoices(
          { name: 'copy', value: 'copy' },
          { name: 'analyse', value: 'analyse' },
          { name: 'export', value: 'export' },
          { name: 'build', value: 'build' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('source_server')
        .setDescription('Source server ID for analyse/export.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('destination_server')
        .setDescription('Destination server ID for analyse/build.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Template name for export.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('template_id')
        .setDescription('Optional stable template ID for export.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('version')
        .setDescription('Template version for export.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Short template description for export.')
        .setRequired(false)
    ),

  async execute(interaction) {
    return duplicator.run(interaction);
  },
};
