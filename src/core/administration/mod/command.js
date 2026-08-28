'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const { openModPanel } = require('./panel');
const { openExternalAppealFromCommand } = require('./cases');

const MOD_COMMAND_PERMISSIONS = PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers;

const command = {
  category: 'Moderation',
  help: { name: 'mod', description: '🔐 Open moderation hub and staff tools, or appeal a case by DM.', usage: '/mod or /mod appeal:SERVER_ID:CASE_ID' },
  access: { level: 'mod', ownerOnly: false },
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and staff tools')
    .addStringOption((option) => option.setName('appeal').setDescription('Appeal a case using SERVER_ID:CASE_ID (works in bot DMs)').setRequired(false).setMaxLength(40))
    .setDefaultMemberPermissions(MOD_COMMAND_PERMISSIONS),
  async execute(interaction) {
    const appealReference = interaction.options?.getString?.('appeal') || null;
    if (appealReference) {
      try {
        return openExternalAppealFromCommand(interaction, appealReference);
      } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('❌ Appeal command fallback failed:', error);
        if (!interaction.deferred && !interaction.replied) return interaction.reply({ content: '❌ Failed to open the appeal form.' }).catch(() => null);
        return safeEditReply(interaction, { content: '❌ Failed to open the appeal form.', embeds: [], components: [] });
      }
    }
    const denied = await enforceCommandAccess(interaction, command);
    if (denied) return;
    try {
      if (!interaction.guild) {
        return safeEditReply(interaction, { embeds: [errorEmbed('Use `/mod appeal:SERVER_ID:CASE_ID` in DM to appeal a moderation case. The moderation panel itself can only be used inside a server.')] });
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
