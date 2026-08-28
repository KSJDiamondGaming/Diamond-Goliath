'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const { openModPanel } = require('./panel');

const MOD_COMMAND_PERMISSIONS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers;

const command = {
  category: 'Moderation',
  help: { name: 'mod', description: '🔐 Open moderation hub and staff tools.', usage: '/mod' },
  access: { level: 'mod', ownerOnly: false },
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and staff tools')
    .setDefaultMemberPermissions(MOD_COMMAND_PERMISSIONS),
  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, command);
    if (denied) return;
    try {
      if (!interaction.guild) {
        return safeEditReply(interaction, { embeds: [errorEmbed('This command can only be used inside a server.')] });
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
      return openModPanel(interaction);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('❌ Mod command failed:', error);
      return safeEditReply(interaction, {
        embeds: [errorEmbed('Failed to open the moderation hub. Please try again.')],
        components: [],
      });
    }
  },
};

module.exports = command;
