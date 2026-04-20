const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    const client = interaction.client;

    try {
      if (client.isBooting) {
        if (isHandledInteractionType(interaction)) {
          return await safeReply(interaction, {
            content: '⏳ The bot is still starting up. Please try again in a moment.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return;
      }

      if (interaction.isChatInputCommand()) {
        return await handleChatInputCommand(interaction);
      }

      if (interaction.isButton()) {
        return await handleButtonInteraction(interaction);
      }

      if (interaction.isStringSelectMenu()) {
        return await handleStringSelectMenuInteraction(interaction);
      }

      if (interaction.isModalSubmit()) {
        return await handleModalInteraction(interaction);
      }
    } catch (error) {
      console.error('❌ interactionCreate event failed:', error);

      if (isIgnorableInteractionError(error)) {
        return;
      }

      try {
        await safeReply(interaction, {
          content: '❌ Something went wrong while processing that interaction.',
          embeds: [],
          components: [],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        console.error('❌ Failed to send interaction error response:', replyError);
      }
    }
  },
};

async function handleChatInputCommand(interaction) {
  const commandName = interaction.commandName;
  const command = interaction.client.commands.get(commandName);

  if (!command) {
    console.warn(`⚠️ Command not loaded: /${commandName}`);

    return await safeReply(interaction, {
      content: `❌ The command \`/${commandName}\` is not currently available on the bot.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const startedAt = Date.now();

  try {
    await command.execute(interaction, interaction.client);

    const duration = Date.now() - startedAt;

    if (duration > 2500) {
      console.warn(`⏱️ Slow command detected: /${commandName} took ${duration}ms`);
    }
  } catch (error) {
    console.error(`❌ Error executing /${commandName}:`, error);

    if (isIgnorableInteractionError(error)) {
      return;
    }

    await safeReply(interaction, {
      content: '❌ There was an error while running this command.',
      embeds: [],
      components: [],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleButtonInteraction(interaction) {
  try {
    const customId = interaction.customId;

    const caseCommand = interaction.client.commands.get('case');
    if (
      caseCommand &&
      typeof caseCommand.handleCasePanelButton === 'function' &&
      customId.startsWith('casepanel_')
    ) {
      const handled = await caseCommand.handleCasePanelButton(interaction);
      if (handled !== false) return;
    }

    if (customId.startsWith('warnings_')) {
      return;
    }

    console.warn(`⚠️ Unhandled button interaction: ${customId}`);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: '⚠️ That button is not currently handled by the bot.',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error(`❌ Button interaction failed (${interaction.customId}):`, error);

    if (isIgnorableInteractionError(error)) {
      return;
    }

    await safeReply(interaction, {
      content: '❌ Something went wrong while handling that button.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleStringSelectMenuInteraction(interaction) {
  try {
    const customId = interaction.customId;

    const caseCommand = interaction.client.commands.get('case');
    if (
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
  } catch (error) {
    console.error(`❌ Select menu interaction failed (${interaction.customId}):`, error);

    if (isIgnorableInteractionError(error)) {
      return;
    }

    await safeReply(interaction, {
      content: '❌ Something went wrong while handling that menu.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleModalInteraction(interaction) {
  try {
    const customId = interaction.customId;

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
  } catch (error) {
    console.error(`❌ Modal interaction failed (${interaction.customId}):`, error);

    if (isIgnorableInteractionError(error)) {
      return;
    }

    await safeReply(interaction, {
      content: '❌ Something went wrong while handling that modal.',
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
    return await interaction.editReply(stripFlagsForEditReply(safePayload));
  }

  if (interaction.replied) {
    return await interaction.followUp({
      ...safePayload,
      flags: safePayload.flags ?? MessageFlags.Ephemeral,
    });
  }

  return await interaction.reply(safePayload);
}

function stripFlagsForEditReply(payload) {
  const { flags, ...rest } = payload;
  return rest;
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

function isHandledInteractionType(interaction) {
  return (
    interaction.isChatInputCommand() ||
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isModalSubmit()
  );
}