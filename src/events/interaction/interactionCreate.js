// src/events/interaction/interactionCreate.js

const automodPanel = require('../../functions/automod/automodPanel');
const embedPanel = require('../../functions/embed/embedPanel');

const { handleAdminNavigation } = require('../../functions/admin/adminPanel');
const security = require('../../security/securitySystem');
const restoreRequestManager = require('../../security/restoreRequestManager');

const panelNav = require('../../helpers/ui/panelNavigation');

function startsWithCustomId(interaction, prefix) {
  return String(interaction.customId || '').startsWith(prefix);
}

function isAdminInteraction(interaction) {
  return startsWithCustomId(interaction, 'admin:');
}

function isAutomodInteraction(interaction) {
  return startsWithCustomId(interaction, 'automod:');
}

function isEmbedInteraction(interaction) {
  return startsWithCustomId(interaction, 'embed:');
}

function isRestoreInteraction(interaction) {
  return startsWithCustomId(interaction, 'restore_request_');
}

function isSecurityTestInteraction(interaction) {
  return startsWithCustomId(interaction, 'securitytest:');
}

function isNavigationInteraction(interaction) {
  return startsWithCustomId(interaction, 'nav|');
}

function isPanelComponent(interaction) {
  return (
    interaction.isButton?.() ||
    interaction.isRoleSelectMenu?.() ||
    interaction.isChannelSelectMenu?.() ||
    interaction.isStringSelectMenu?.() ||
    interaction.isModalSubmit?.()
  );
}

function isProtectedPanelInteraction(interaction) {
  if (!isPanelComponent(interaction)) return false;

  return (
    isNavigationInteraction(interaction) ||
    isAdminInteraction(interaction) ||
    isAutomodInteraction(interaction) ||
    isEmbedInteraction(interaction)
  );
}

async function safeReply(interaction, messageOrPayload) {
  const payload =
    typeof messageOrPayload === 'string'
      ? {
          content: messageOrPayload,
          embeds: [],
          components: [],
          flags: 64,
        }
      : {
          embeds: [],
          components: [],
          flags: 64,
          ...messageOrPayload,
        };

  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    if (error?.code === 10062) {
      console.warn('⚠️ Interaction expired before reply could be sent.');
      return null;
    }

    console.error('❌ Failed to reply to interaction:', error);
    return null;
  }
}

async function handleSecurityTestSlashCommand(interaction, activeClient) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'securitytest') {
    return false;
  }

  const securityTestCommand = activeClient.commands.get('securitytest');

  if (!securityTestCommand?.execute) {
    await safeReply(
      interaction,
      '❌ Security test command is missing. Check the securitytest command file.'
    );

    return true;
  }

  await securityTestCommand.execute(interaction, activeClient);
  return true;
}

async function handleSecurityTestButton(interaction, activeClient) {
  if (!interaction.isButton() || !isSecurityTestInteraction(interaction)) {
    return false;
  }

  const securityTestCommand = activeClient.commands.get('securitytest');

  if (!securityTestCommand?.handleButton) {
    await safeReply(
      interaction,
      '❌ Security test handler is missing. Check the securitytest command file.'
    );

    return true;
  }

  await securityTestCommand.handleButton(interaction, activeClient);
  return true;
}

async function handlePurgeModal(interaction) {
  const rawAmount = interaction.fields.getTextInputValue('amount');
  const amount = Number(rawAmount);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return safeReply(interaction, '❌ Please enter a number between 1 and 100.');
  }

  if (!interaction.channel?.bulkDelete) {
    return safeReply(interaction, '❌ This channel does not support bulk delete.');
  }

  const deleted = await interaction.channel.bulkDelete(amount, true);

  return safeReply(interaction, `✅ Deleted ${deleted.size} message(s).`);
}

async function handlePanelNavigation(interaction) {
  const parsed = panelNav.parseCustomId(interaction.customId);
  if (!parsed) return false;

  let { state, action } = parsed;

  if (action === 'back') {
    state = panelNav.back(state);
  }

  if (action === 'home') {
    interaction.customId = 'admin:home';
    return handleAdminNavigation(interaction, state);
  }

  const currentPanel = panelNav.current(state) || 'admin:home';

  if (currentPanel.startsWith('admin:')) {
    interaction.customId = currentPanel;
    return handleAdminNavigation(interaction, state);
  }

  if (currentPanel.startsWith('automod:')) {
    interaction.customId = currentPanel;
    return automodPanel.handleInteraction(interaction, state);
  }

  if (currentPanel.startsWith('embed:')) {
    interaction.customId = currentPanel;
    return embedPanel.handleInteraction(interaction, state);
  }

  interaction.customId = 'admin:home';
  return handleAdminNavigation(interaction, state);
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    const activeClient = client || interaction.client;

    try {
      /*
       * FAST PATHS
       * These must happen before admin/embed/security middleware.
       * Discord interactions expire quickly if they are not acknowledged.
       */

      // 0. Security test slash command.
      if (interaction.isChatInputCommand() && interaction.commandName === 'securitytest') {
        if (await handleSecurityTestSlashCommand(interaction, activeClient)) return;
      }

      // 0.5 Security test buttons.
      if (interaction.isButton() && isSecurityTestInteraction(interaction)) {
        if (await handleSecurityTestButton(interaction, activeClient)) return;
      }

      // 1. Restore approval system buttons.
      if (interaction.isButton() && isRestoreInteraction(interaction)) {
        const handledRestoreButton =
          await restoreRequestManager.handleRestoreButton(interaction);

        if (handledRestoreButton) return;
      }

      // 2. Protected panel security middleware.
      if (isProtectedPanelInteraction(interaction)) {
        const check = await security.enforceInteractionSecurity(interaction, {
          level: 'admin',
          cooldownKey: interaction.customId,
          cooldownMs: 1500,
          guildOnly: true,
        });

        if (!check.allowed) return;
      }

      // 3. Global nav system.
      if (isNavigationInteraction(interaction)) {
        if (await handlePanelNavigation(interaction)) return;
      }

      // 4. Admin purge modal.
      if (interaction.isModalSubmit() && interaction.customId === 'admin:purgeModal') {
        return handlePurgeModal(interaction);
      }

      // 5. Embed panel owns embed:* and its own admin:back/admin:home buttons.
      if (
        isEmbedInteraction(interaction) ||
        interaction.customId === 'admin:back' ||
        interaction.customId === 'admin:home'
      ) {
        if (await embedPanel.handleInteraction(interaction)) return;
      }

      // 6. Automod panel.
      if (isAutomodInteraction(interaction)) {
        if (await automodPanel.handleInteraction(interaction)) return;
      }

      // 7. Admin panel.
      if (isAdminInteraction(interaction)) {
        if (await handleAdminNavigation(interaction)) return;
      }

      // 8. Normal slash commands.
      if (interaction.isChatInputCommand()) {
        const command = activeClient.commands.get(interaction.commandName);

        if (!command) {
          return safeReply(interaction, '❌ Command not found.');
        }

        return command.execute(interaction, activeClient);
      }

      // 9. Help select menu.
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help-category-select') {
          const helpCommand = activeClient.commands.get('help');

          if (helpCommand?.handleHelpSelectMenu) {
            return helpCommand.handleHelpSelectMenu(interaction, activeClient);
          }
        }

        return false;
      }

      // 10. Help buttons / unhandled buttons.
      if (interaction.isButton()) {
        if (
          interaction.customId === 'help-back-home' ||
          interaction.customId === 'help-close'
        ) {
          const helpCommand = activeClient.commands.get('help');

          if (helpCommand?.handleHelpButton) {
            return helpCommand.handleHelpButton(interaction, activeClient);
          }
        }

        console.warn('⚠️ Unhandled button:', interaction.customId);
        return false;
      }

      return false;
    } catch (error) {
      console.error('❌ Interaction error:', error);

      return safeReply(
        interaction,
        '❌ Something went wrong while handling this interaction.'
      );
    }
  },
};