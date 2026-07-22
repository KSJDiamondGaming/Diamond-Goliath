'use strict';

const ADMIN_DEFER_PREFIXES = [
  'admin:',
];

function shouldPreDefer(interaction) {
  if (!interaction?.isMessageComponent?.()) return false;
  const customId = String(interaction.customId || '');
  return ADMIN_DEFER_PREFIXES.some((prefix) => customId === prefix || customId.startsWith(prefix));
}

function wrapResponses(interaction) {
  if (!interaction || interaction.__goliathResponsesGuarded) return;
  interaction.__goliathResponsesGuarded = true;

  const originalDeferUpdate = typeof interaction.deferUpdate === 'function'
    ? interaction.deferUpdate.bind(interaction)
    : null;
  const originalUpdate = typeof interaction.update === 'function'
    ? interaction.update.bind(interaction)
    : null;
  const originalReply = typeof interaction.reply === 'function'
    ? interaction.reply.bind(interaction)
    : null;

  if (originalDeferUpdate) {
    interaction.deferUpdate = async (...args) => {
      if (interaction.deferred || interaction.replied) return interaction;
      try {
        return await originalDeferUpdate(...args);
      } catch (error) {
        if (error?.code === 40060) return interaction;
        throw error;
      }
    };
  }

  if (originalUpdate) {
    interaction.update = async (payload) => {
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
      return originalUpdate(payload);
    };
  }

  if (originalReply) {
    interaction.reply = async (payload) => {
      if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
      return originalReply(payload);
    };
  }
}

async function prepareInteraction(interaction) {
  if (!interaction?.isMessageComponent?.()) return;
  wrapResponses(interaction);
  if (!shouldPreDefer(interaction)) return;

  if (!interaction.__goliathPreparePromise) {
    interaction.__goliathPreparePromise = (async () => {
      if (interaction.deferred || interaction.replied) return;
      await interaction.deferUpdate();
    })();
  }

  await interaction.__goliathPreparePromise;
}

module.exports = {
  prepareInteraction,
};