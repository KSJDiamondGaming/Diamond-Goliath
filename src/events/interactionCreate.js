const { MessageFlags } = require('discord.js');

const {
  handleModPanelInteraction,
  handleModPanelModal,
} = require('../utils/moderation/modPanel');

const helpCommand = require('../commands/utility/help');
const automodPanel = require('../bot/interactions/automod/automodPanel');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    try {
      if (interaction.client.isBooting) {
        if (isHandledInteractionType(interaction)) {
          return safeReply(interaction, {
            content: '⏳ Bot is still starting up. Please try again in a moment.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return;
      }

      if (interaction.isChatInputCommand()) {
        return handleChatInputCommand(interaction);
      }

      if (interaction.isButton()) {
        return handleButtonInteraction(interaction);
      }

      if (
        interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isMentionableSelectMenu()
      ) {
        return handleSelectMenuInteraction(interaction);
      }

      if (interaction.isModalSubmit()) {
        return handleModalInteraction(interaction);
      }
    } catch (error) {
      if (isIgnorableInteractionError(error)) return;

      console.error('❌ interactionCreate event failed:', error);

      await safeReply(interaction, {
        content: '❌ Something went wrong while processing that interaction.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};

async function handleChatInputCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    return safeReply(interaction, {
      content: `❌ The command \`/${interaction.commandName}\` is not currently available.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await command.execute(interaction, interaction.client);
  } catch (error) {
    if (isIgnorableInteractionError(error)) return;

    console.error(`❌ Error executing /${interaction.commandName}:`, error);

    await safeReply(interaction, {
      content: '❌ There was an error while running this command.',
      embeds: [],
      components: [],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  if (
    typeof helpCommand.handleHelpButton === 'function' &&
    (customId === 'help-back-home' || customId === 'help-close')
  ) {
    const handled = await helpCommand.handleHelpButton(interaction);
    if (handled !== false) return;
  }

  if (
    typeof automodPanel.handleInteraction === 'function' &&
    customId.startsWith('automod_')
  ) {
    const handled = await automodPanel.handleInteraction(interaction);
    if (handled !== false) return;
  }

  if (
    typeof handleModPanelInteraction === 'function' &&
    customId.startsWith('mod_')
  ) {
    const handled = await handleModPanelInteraction(interaction);
    if (handled !== false) return;
  }

  const caseCommand = interaction.client.commands.get('case');

  if (
    caseCommand &&
    typeof caseCommand.handleCasePanelButton === 'function' &&
    customId.startsWith('casepanel_')
  ) {
    const handled = await caseCommand.handleCasePanelButton(interaction);
    if (handled !== false) return;
  }

  if (customId.startsWith('warnings_')) return;

  console.warn(`⚠️ Unhandled button interaction: ${customId}`);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: '⚠️ That button is not currently handled by the bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;

  if (
    typeof automodPanel.handleInteraction === 'function' &&
    customId.startsWith('automod_')
  ) {
    const handled = await automodPanel.handleInteraction(interaction);
    if (handled !== false) return;
  }

  if (
    interaction.isStringSelectMenu() &&
    typeof helpCommand.handleHelpSelectMenu === 'function' &&
    customId === 'help-category-select'
  ) {
    const handled = await helpCommand.handleHelpSelectMenu(interaction);
    if (handled !== false) return;
  }

  const caseCommand = interaction.client.commands.get('case');

  if (
    interaction.isStringSelectMenu() &&
    caseCommand &&
    typeof caseCommand.handleCasePanelSelectMenu === 'function' &&
    customId.startsWith('casepanel_')
  ) {
    const handled = await caseCommand.handleCasePanelSelectMenu(interaction);
    if (handled !== false) return;
  }

  console.warn(`⚠️ Unhandled select menu interaction: ${customId}`);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: '⚠️ That menu is not currently handled by the bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleModalInteraction(interaction) {
  const customId = interaction.customId;

  if (
    typeof automodPanel.handleInteraction === 'function' &&
    customId.startsWith('automod_')
  ) {
    const handled = await automodPanel.handleInteraction(interaction);
    if (handled !== false) return;
  }

  if (
    typeof handleModPanelModal === 'function' &&
    customId.startsWith('mod_')
  ) {
    const handled = await handleModPanelModal(interaction);
    if (handled !== false) return;
  }

  const caseCommand = interaction.client.commands.get('case');

  if (
    caseCommand &&
    typeof caseCommand.handleCasePanelModal === 'function' &&
    customId.startsWith('casepanel_')
  ) {
    const handled = await caseCommand.handleCasePanelModal(interaction);
    if (handled !== false) return;
  }

  console.warn(`⚠️ Unhandled modal interaction: ${customId}`);

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: '⚠️ That modal is not currently handled by the bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function safeReply(interaction, payload) {
  const safePayload = {
    ...payload,
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  };

  if (interaction.deferred) {
    const { flags, ...editPayload } = safePayload;
    return interaction.editReply(editPayload);
  }

  if (interaction.replied) {
    return interaction.followUp({
      ...safePayload,
      flags: safePayload.flags ?? MessageFlags.Ephemeral,
    });
  }

  return interaction.reply(safePayload);
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

function isHandledInteractionType(interaction) {
  return (
    interaction.isChatInputCommand() ||
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isUserSelectMenu() ||
    interaction.isMentionableSelectMenu() ||
    interaction.isModalSubmit()
  );
}