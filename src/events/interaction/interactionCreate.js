// src/events/interactionCreate.js

const { MessageFlags } = require('discord.js');

const ticketInteractionHandler = require('../../modules/tickets/ticketInteractionHandler');
const embedPanel = require('../../functions/embed/embedPanel');

const seenInteractions = new Set();

function markInteraction(interaction) {
  if (!interaction?.id) return false;

  if (seenInteractions.has(interaction.id)) return false;

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
    if (isUnknownInteraction(error) || isAlreadyAcknowledged(error)) return false;
    throw error;
  }
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
        `⚠️ Interaction expired before defer: ${interaction.id} / ${
          interaction.commandName || interaction.customId || 'unknown'
        }`
      );
      return false;
    }

    if (isAlreadyAcknowledged(error)) return true;

    throw error;
  }
}

async function runHandler(name, handler, interaction, client) {
  if (!handler) return false;

  try {
    const handled = await handler(interaction, client);

    if (handled) {
      console.log(`✅ Interaction handled by ${name}: ${interaction.customId || interaction.commandName}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Interaction handler failed: ${name}`);
    console.error(error);

    await safeEdit(interaction, {
      content: `❌ ${name} failed. Check VPS logs.`,
    }).catch(() => null);

    return true;
  }
}

async function handleEmbedInteraction(interaction, client) {
  if (!interaction.customId?.startsWith('embed:')) return false;

  console.log(`🧩 Routing embed interaction: ${interaction.customId}`);

  const possibleHandlers = [
    embedPanel.handleInteraction,
    embedPanel.handleEmbedInteraction,
    embedPanel.handleEmbedPanel,
    embedPanel.execute,
    typeof embedPanel === 'function' ? embedPanel : null,
  ].filter(Boolean);

  for (const handler of possibleHandlers) {
    const handled = await runHandler('embedPanel', handler, interaction, client);
    if (handled) return true;
  }

  console.error('❌ No valid embedPanel handler export found.');

  await safeEdit(interaction, {
    content: '❌ Embed panel handler is missing. Check embedPanel.js exports.',
  });

  return true;
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (!interaction || !client) return;

    console.log(
      `[INTERACTION] ${
        interaction.customId ||
        interaction.commandName ||
        interaction.type
      }`
    );

    if (!markInteraction(interaction)) {
      console.warn(`⚠️ Duplicate interaction ignored: ${interaction.id}`);
      return;
    }

<<<<<<< Updated upstream
    console.log(
      `🧩 interactionCreate: ${
        interaction.type
      } ${interaction.commandName || interaction.customId || 'unknown'}`
    );

=======
>>>>>>> Stashed changes
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands?.get(interaction.commandName);
        if (!command?.autocomplete) return;

        await command.autocomplete(interaction, client).catch(console.error);
        return;
      }

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
          console.error(`❌ Command execution failed: ${interaction.commandName}`);
          console.error(error);
          console.error(error?.stack);

          await safeEdit(interaction, {
            content: '❌ An error occurred while executing this command.',
          });
        }

        return;
      }

      if (interaction.customId?.startsWith('embed:')) {
<<<<<<< Updated upstream
        const handled = await handleEmbedInteraction(interaction, client);
        if (handled) return;
      }

      const ticketHandled =
        await ticketInteractionHandler.handleTicketInteraction(interaction);

      if (ticketHandled) return;

      console.warn(
        `⚠️ Unhandled interaction: ${interaction.commandName || interaction.customId || 'unknown'}`
      );
=======
        console.log(`[EMBED] ${interaction.customId}`);

        const handled = await embedPanel.handleInteraction(interaction, client);
        if (handled) return;
      }

      if (typeof ticketInteractionHandler?.handleTicketInteraction === 'function') {
        const handled = await ticketInteractionHandler.handleTicketInteraction(
          interaction,
          client
        );

        if (handled) return;
      }
>>>>>>> Stashed changes
    } catch (error) {
      console.error('❌ interactionCreate fatal error');
      console.error(error);
      console.error(error?.stack);

      await safeEdit(interaction, {
        content: '❌ Something went wrong while handling this interaction.',
      }).catch(() => null);
    }
  },
};