// src/events/interaction/interactionCreate.js

const { MessageFlags } = require('discord.js');

const ticketInteractionHandler = require('../../modules/tickets/ticketInteractionHandler');
const roleInteractionHandler = require('../../modules/roles/roleInteractionHandler');
const embedPanel = require('../../functions/embed/embedPanel');
const adminPanel = require('../../functions/admin/adminPanel');
const adminModuleHandler = require('../../functions/admin/adminModuleHandler');
const panelNav = require('../../helpers/ui/panelNavigation');
const helpCommand = require('../../commands/utility/help');

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

function isExpiredOrAcknowledged(error) {
  return isUnknownInteraction(error) || isAlreadyAcknowledged(error);
}

function interactionLabel(interaction) {
  return interaction?.customId || interaction?.commandName || interaction?.type || 'unknown';
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
    if (isExpiredOrAcknowledged(error)) return false;
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
      console.warn(`⚠️ Interaction expired before defer: ${interaction.id} / ${interactionLabel(interaction)}`);
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
      console.log(`✅ Interaction handled by ${name}: ${interactionLabel(interaction)}`);
      return true;
    }

    return false;
  } catch (error) {
    if (isUnknownInteraction(error)) {
      console.warn(`⚠️ ${name} interaction expired before response: ${interaction.id} / ${interactionLabel(interaction)}`);
      return true;
    }

    if (isAlreadyAcknowledged(error)) {
      console.warn(`⚠️ ${name} interaction was already acknowledged: ${interaction.id} / ${interactionLabel(interaction)}`);
      return true;
    }

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

async function handleHelpInteraction(interaction) {
  if (!interaction.customId) return false;

  if (interaction.customId === 'help-category-select') {
    return helpCommand.handleHelpSelectMenu(interaction);
  }

  if (interaction.customId === 'help-back-home' || interaction.customId === 'help-close') {
    return helpCommand.handleHelpButton(interaction);
  }

  return false;
}

function isAdminBackAlias(customId = '') {
  return customId === 'admin:back' || customId === 'admin:home' || customId === 'admin:main';
}

async function handleNavigationInteraction(interaction) {
  const parsed = panelNav.parseCustomId(interaction.customId);
  if ((!parsed || parsed.action !== 'back') && !isAdminBackAlias(interaction.customId)) return false;

  const memberDisplayName =
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User';

  const payload = adminPanel.buildAdminPanel(interaction.guild, memberDisplayName);

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return true;
    }

    if (typeof interaction.update === 'function') {
      await interaction.update(payload);
      return true;
    }

    await interaction.reply({
      ...payload,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  } catch (error) {
    if (isExpiredOrAcknowledged(error)) return true;
    throw error;
  }
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (!interaction || !client) return;

    console.log(`[INTERACTION] ${interactionLabel(interaction)}`);

    if (!markInteraction(interaction)) {
      console.warn(`⚠️ Duplicate interaction ignored: ${interaction.id}`);
      return;
    }

    console.log(`🧩 interactionCreate: ${interaction.type} ${interactionLabel(interaction)}`);

    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands?.get(interaction.commandName);
        if (!command?.autocomplete) return;

        await command.autocomplete(interaction, client).catch((error) => {
          if (!isExpiredOrAcknowledged(error)) console.error(error);
        });
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
          if (isExpiredOrAcknowledged(error)) {
            console.warn(`⚠️ Command interaction expired/already acknowledged: ${interaction.commandName}`);
            return;
          }

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
        const handled = await handleEmbedInteraction(interaction, client);
        if (handled) return;
      }

      if (
        interaction.customId === 'help-category-select' ||
        interaction.customId === 'help-back-home' ||
        interaction.customId === 'help-close'
      ) {
        const handled = await handleHelpInteraction(interaction);
        if (handled) return;
      }

      if (interaction.customId?.startsWith('nav|') || isAdminBackAlias(interaction.customId)) {
        const handled = await handleNavigationInteraction(interaction);
        if (handled) return;
      }

      if (typeof adminModuleHandler?.handleAdminModuleInteraction === 'function') {
        const handled = await adminModuleHandler.handleAdminModuleInteraction(interaction, client);
        if (handled) return;
      }

      if (typeof adminPanel?.handleAdminNavigation === 'function') {
        const handled = await adminPanel.handleAdminNavigation(interaction, undefined);
        if (handled) return;
      }

      if (typeof roleInteractionHandler?.handleRoleInteraction === 'function') {
        const handled = await roleInteractionHandler.handleRoleInteraction(interaction, client);
        if (handled) return;
      }

      if (typeof ticketInteractionHandler?.handleTicketInteraction === 'function') {
        const handled = await ticketInteractionHandler.handleTicketInteraction(interaction, client);
        if (handled) return;
      }

      console.warn(`⚠️ Unhandled interaction: ${interactionLabel(interaction)}`);
    } catch (error) {
      if (isExpiredOrAcknowledged(error)) {
        console.warn(`⚠️ Interaction expired/already acknowledged in top-level handler: ${interaction.id} / ${interactionLabel(interaction)}`);
        return;
      }

      console.error('❌ interactionCreate fatal error');
      console.error(error);
      console.error(error?.stack);

      await safeEdit(interaction, {
        content: '❌ Something went wrong while handling this interaction.',
      }).catch(() => null);
    }
  },
};
