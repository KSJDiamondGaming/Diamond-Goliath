'use strict';

// Moderation panel layout contract: feature rows first; the final row is navigation,
// with Back first and Export immediately after it when export is available.
const { SlashCommandBuilder } = require('discord.js');
const { enforceCommandAccess } = require('../../commands/commandAccess');
const { errorEmbed } = require('../../ui/embeds');
const { safeEditReply } = require('../../ui/interactionResponse');
const { openModPanel } = require('./panel');
const { recordModerationSystemEvent, getModerationDoctorStatus } = require('./permissions');

const command = {
  category: 'Moderation',
  help: { name: 'mod', description: '🔐 Open Goliath’s moderation hub and management tools.', usage: '/mod' },
  access: { level: 'mod', ownerOnly: false },
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('🔐 Open Goliath’s moderation hub and management tools'),
  async execute(interaction) {
    const denied = await enforceCommandAccess(interaction, command);
    if (denied) {
      recordModerationSystemEvent({ interaction, event: 'moderation.command.denied', action: 'view_dashboard', reason: 'Command access policy denied the moderation hub.' });
      return;
    }
    try {
      if (!interaction.guild) {
        recordModerationSystemEvent({ interaction, guildId: 'dm', event: 'moderation.command.invalid_context', action: 'view_dashboard', reason: 'Moderation panel requested outside a guild.' });
        return safeEditReply(interaction, { embeds: [errorEmbed('The moderation hub can only be used inside a server. Member appeals are submitted from `/user` → Account → Appeals.')] });
      }
      const doctor = getModerationDoctorStatus();
      if (!doctor.ok) recordModerationSystemEvent({ interaction, event: 'moderation.doctor.warning', action: 'view_dashboard', after: doctor });
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
      return openModPanel(interaction);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) return;
      console.error('❌ Mod command failed:', error);
      recordModerationSystemEvent({ interaction, event: 'moderation.command.failed', action: 'view_dashboard', reason: error?.message || error, metadata: { stack: String(error?.stack || '').slice(0, 1500) } });
      return safeEditReply(interaction, {
        embeds: [errorEmbed('Failed to open the moderation hub. Please try again.')],
        components: [],
      });
    }
  },
};

module.exports = command;
