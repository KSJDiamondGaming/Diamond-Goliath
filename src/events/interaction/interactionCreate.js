// src/events/interaction/interactionCreate.js

const { MessageFlags } = require('discord.js');

const ticketInteractionHandler = require('../../modules/tickets/ticketInteractionHandler');

const seenInteractions = new Set();

const security = require('../../security/securityCore');

function markInteraction(interaction) {
  if (!interaction?.id) return false;

  if (seenInteractions.has(interaction.id)) {
    return false;
  }

  seenInteractions.add(interaction.id);

  setTimeout(() => {
    seenInteractions.delete(interaction.id);
  }, 60_000);

  return true;
}

function isUnknownInteraction(error) {
  return error?.code === 10062;
}

function isAlreadyAcknowledged(error) {
  return error?.code === 40060;
}

async function safeDefer(interaction) {
  if (!interaction?.isRepliable?.()) return false;
  if (interaction.deferred || interaction.replied) return true;

  try {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    return true;
  } catch (error) {
    if (isUnknownInteraction(error)) {
      console.error(
        `⚠️ Interaction expired before defer: ${interaction.id} / ${interaction.commandName || interaction.customId || 'unknown'}`
      );
      return false;
    }

    if (isAlreadyAcknowledged(error)) {
      return true;
    }

    throw error;
  }
}

async function safeEdit(interaction, payload = {}) {
  if (!interaction?.isRepliable?.()) return false;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return true;
    }

    await interaction.reply({
      ...payload,
      flags: payload.flags || MessageFlags.Ephemeral,
    });

    return true;
  } catch (error) {
    if (isUnknownInteraction(error) || isAlreadyAcknowledged(error)) {
      return false;
    }

    throw error;
  }
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (!interaction || !client) return;

    if (!markInteraction(interaction)) {
      console.warn(
        `⚠️ Duplicate interaction ignored: ${interaction.id}`
      );
      return;
    }

    try {
      /*
      ==========================================
      AUTOCOMPLETE
      Must NOT defer autocomplete.
      ==========================================
      */

      if (interaction.isAutocomplete()) {
        const command = client.commands?.get(interaction.commandName);
        if (!command?.autocomplete) return;

        await command.autocomplete(interaction, client).catch(console.error);
        return;
      }

      /*
      ==========================================
      SLASH COMMANDS
      ==========================================
      */

      if (interaction.isChatInputCommand()) {
        const deferred = await safeDefer(interaction);
        if (!deferred) return;

        const command = client.commands?.get(interaction.commandName);

        if (!command) {
          await safeEdit(interaction, {
            content: '❌ Command not found.',
          });
          return;
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          console.error(
            `❌ Command execution failed: ${interaction.commandName}`
          );
          console.error(error);

          await safeEdit(interaction, {
            content: '❌ An error occurred while executing this command.',
          });
        }

        return;
      }

      /*
      ==========================================
      COMPONENTS / MODALS / SELECTS
      Ticket handler owns component lifecycle.
      ==========================================
      */

      const handled =
        await ticketInteractionHandler.handleTicketInteraction(interaction);

      if (handled) return;
    } catch (error) {
      console.error('❌ interactionCreate fatal error');
      console.error(error);

      await safeEdit(interaction, {
        content: '❌ Something went wrong while handling this interaction.',
      }).catch(() => null);
    }
  },
};