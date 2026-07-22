'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildSocialAdminPanel } = require('../../modules/social/socialPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('socialhub')
    .setDescription('Open the Social Studio workspace.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: '❌ Social Studio is only available inside a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const payload = buildSocialAdminPanel(
      interaction.guild,
      interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || 'Administrator',
    );
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  },
};
