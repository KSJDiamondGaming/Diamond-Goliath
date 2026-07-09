'use strict';

// src/events/interactions/interactionCreate.js

const { Events, MessageFlags } = require('discord.js');

const verificationManager = require('../../modules/verification/verificationManager');
const ticketInteractionHandler = require('../../modules/tickets/ticketInteractionHandler');
const roleInteractionHandler = require('../../modules/roles/roleInteractionHandler');
const pollsManager = require('../../modules/polls/pollsManager');
const tempVoiceInteractionHandler = require('../../modules/tempvoice/tempVoiceInteractionHandler');
const suggestionsInteractionHandler = require('../../modules/suggestions/suggestionsInteractionHandler');
const giveawaysInteractionHandler = require('../../modules/giveaways/giveawaysInteractionHandler');
const testSecurityCommand = require('../../commands/admin/testsecurity');
const embedPanel = require('../../modules/embed/functions/embedPanel');
const duplicator = require('../../core/dev/duplicator');
const adminPanel = require('../../core/admin/functions/adminPanel');
const statsAdminPanel = require('../../core/admin/functions/statsAdminPanel');
const reactionRolesAdminPanel = require('../../core/admin/functions/reactionRolesAdminPanel');
const suggestionsAdminPanel = require('../../core/admin/functions/suggestionsAdminPanel');
const giveawaysAdminPanel = require('../../core/admin/functions/giveawaysAdminPanel');
const moduleAdminPanels = require('../../core/admin/functions/moduleAdminPanels');

async function safeInteractionError(interaction) {
  const payload = {
    content: '❌ Interaction failed. Check bot logs for details.',
    flags: MessageFlags.Ephemeral,
  };

  try {
    if (interaction?.isAutocomplete?.()) {
      await interaction.respond([]).catch(() => null);
      return;
    }

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
      if (interaction?.isAutocomplete?.()) {
        const command = client.commands?.get?.(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        } else {
          await interaction.respond([]).catch(() => null);
        }
        return;
      }

      if (!interaction?.customId && !interaction?.isChatInputCommand?.()) {
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        const command = client.commands?.get?.(interaction.commandName);

        if (!command) return;

        await command.execute(interaction, client);
        return;
      }

      if (await statsAdminPanel.handleStatsAdminInteraction(interaction)) {
        return;
      }

      if (await reactionRolesAdminPanel.handleReactionRolesAdminInteraction(interaction)) {
        return;
      }

      if (await suggestionsAdminPanel.handleSuggestionsAdminInteraction(interaction)) {
        return;
      }

      if (await giveawaysAdminPanel.handleGiveawaysAdminInteraction(interaction)) {
        return;
      }

      if (await moduleAdminPanels.handleModuleAdminInteraction(interaction)) {
        return;
      }

      if (await adminPanel.handleAdminNavigation(interaction)) {
        return;
      }

      if (await duplicator.handleInteraction(interaction)) {
        return;
      }

      if (await embedPanel.handleInteraction(interaction)) {
        return;
      }

      if (interaction.isButton?.() && await testSecurityCommand.handleButton(interaction)) {
        return;
      }

      if (interaction.isButton?.() && await tempVoiceInteractionHandler.handleTempVoiceInteraction(interaction, client)) {
        return;
      }

      if (await suggestionsInteractionHandler.handleSuggestionsInteraction(interaction)) {
        return;
      }

      if (await giveawaysInteractionHandler.handleGiveawayInteraction(interaction)) {
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
