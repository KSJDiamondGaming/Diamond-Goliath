const { MessageFlags } = require('discord.js');

const {
  handleCommands,
  handleButtons,
  handleSelects,
  handleModals,
} = require('../interactions');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (client?.isBooting) {
        if (isHandledInteractionType(interaction)) {
          return safeReply(interaction, {
            content: '⏳ Bot is still starting up. Please try again in a moment.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return;
      }

      if (interaction.isChatInputCommand()) {
        return handleCommands(interaction, client);
      }

      if (interaction.isButton()) {
        return handleButtons(interaction, client);
      }

      if (isSelectMenu(interaction)) {
        return handleSelects(interaction, client);
      }

      if (interaction.isModalSubmit()) {
        return handleModals(interaction, client);
      }
    } catch (error) {
      if (isIgnorableInteractionError(error)) return;

      console.error('[EVENT: interactionCreate]', error);

      await safeReply(interaction, {
        content: '❌ Something went wrong while processing that interaction.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};

function isSelectMenu(interaction) {
  return (
    interaction.isStringSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isUserSelectMenu() ||
    interaction.isMentionableSelectMenu()
  );
}

function isHandledInteractionType(interaction) {
  return (
    interaction.isChatInputCommand() ||
    interaction.isButton() ||
    isSelectMenu(interaction) ||
    interaction.isModalSubmit()
  );
}

function isIgnorableInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
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