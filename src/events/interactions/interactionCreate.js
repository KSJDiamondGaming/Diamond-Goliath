'use strict';

// src/events/interactions/interactionCreate.js

const { Events, MessageFlags } = require('discord.js');

const verificationManager = require('../../modules/verification/verificationManager');
const ticketInteractionHandler = require('../../modules/tickets/ticketInteractionHandler');
const roleInteractionHandler = require('../../modules/roles/roleInteractionHandler');
const pollsManager = require('../../modules/polls/pollsManager');
const testSecurityCommand = require('../../commands/admin/testsecurity');

async function safeInteractionError(interaction) {
  const payload = {
    content: '❌ Interaction failed. Check bot logs for details.',
    flags: MessageFlags.Ephemeral,
  };

  try {
    if (interaction?.deferred || interaction?.replied) {
      await interaction.followUp(payload).catch(() => null);
      return;
    }

    await interaction?.reply?.(payload).catch(() => null);
  } catch {
    // Ignore final safety response errors.
  }
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    try {
      if (!interaction?.customId && !interaction?.isChatInputCommand?.()) {
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        const command = client.commands?.get?.(interaction.commandName);

        if (!command) return;

        await command.execute(interaction, client);
        return;
      }

      if (interaction.isButton?.() && await testSecurityCommand.handleButton(interaction)) {
        return;
      }

      if (interaction.isButton?.() && verificationManager.parseVerifyCustomId(interaction.customId)) {
        await verificationManager.handleVerificationInteraction(interaction);
        return;
      }

      if (interaction.isButton?.() && await pollsManager.vote(interaction)) {
        return;
      }

      if (await ticketInteractionHandler.handleTicketInteraction(interaction, client)) {
        return;
      }

      if (await roleInteractionHandler.handleRoleInteraction(interaction)) {
        return;
      }
    } catch (error) {
      console.error('[InteractionCreate] Failed to handle interaction:', error);
      await safeInteractionError(interaction);
    }
  },
};
