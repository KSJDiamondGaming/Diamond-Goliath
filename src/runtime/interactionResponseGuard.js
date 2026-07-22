'use strict';

const ADMIN_DEFER_PREFIXES = [
  'admin:',
];

function shouldPreDefer(interaction) {
  if (!interaction?.isMessageComponent?.()) return false;
  const customId = String(interaction.customId || '');
  return ADMIN_DEFER_PREFIXES.some((prefix) => customId === prefix || customId.startsWith(prefix));
}

function wrapUpdate(interaction) {
  if (!interaction || interaction.__goliathUpdateGuarded || typeof interaction.update !== 'function') return;
  interaction.__goliathUpdateGuarded = true;
  const originalUpdate = interaction.update.bind(interaction);
  interaction.update = async (payload) => {
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return originalUpdate(payload);
  };
}

async function prepareInteraction(interaction) {
  if (!interaction?.isMessageComponent?.()) return;
  wrapUpdate(interaction);
  if (!shouldPreDefer(interaction)) return;

  if (!interaction.__goliathPreparePromise) {
    interaction.__goliathPreparePromise = (async () => {
      if (interaction.deferred || interaction.replied) return;
      try {
        await interaction.deferUpdate();
      } catch (error) {
        if (error?.code === 40060) return;
        throw error;
      }
    })();
  }

  await interaction.__goliathPreparePromise;
}

module.exports = {
  prepareInteraction,
};
