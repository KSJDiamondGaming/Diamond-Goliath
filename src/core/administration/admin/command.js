'use strict';

const { SlashCommandBuilder } = require('discord.js');

const { buildAdminPanel } = require('./panel');
const socialStudioPanel = require('../../../modules/socialStudio/socialAlerts/socialStudioPanel');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const security = require('../../security/protection/core');

const command = {
  category: 'Admin',

  help: {
    name: 'admin',
    description: 'Open admin controls and server tools.',
    usage: '/admin',
  },

  access: {
    level: 'admin',
    ownerOnly: false,
  },

  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Open Goliath admin controls and server tools')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      if (!interaction.guild) {
        return safeEditReply(interaction, {
          embeds: [errorEmbed('This command can only be used inside a server.')],
        });
      }

      const memberDisplayName =
        interaction.member?.displayName ||
        interaction.user?.displayName ||
        interaction.user?.username ||
        'Unknown User';

      const isFullAdmin = security.hasPermission(interaction, 'admin');
      const canManageSocial =
        typeof socialStudioPanel.canManageSocialStudio === 'function' &&
        socialStudioPanel.canManageSocialStudio(interaction);

      if (!isFullAdmin && canManageSocial) {
        return safeEditReply(
          interaction,
          socialStudioPanel.buildSocialAdminPanel(interaction.guild, memberDisplayName),
        );
      }

      const denied = await enforceCommandAccess(interaction, command);
      if (denied) return;

      return safeEditReply(interaction, buildAdminPanel(interaction.guild, memberDisplayName));
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('❌ Admin command failed:', error);
      return safeEditReply(interaction, {
        embeds: [errorEmbed('Failed to open the admin panel. Please try again.')],
        components: [],
      });
    }
  },
};

module.exports = command;
