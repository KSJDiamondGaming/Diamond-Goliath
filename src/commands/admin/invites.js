'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildPanel } = require('../../modules/invites/invitesPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Open the Invite Studio administration workspace.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: '❌ Invite Studio is only available inside a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...buildPanel(interaction), flags: MessageFlags.Ephemeral });
  },
};