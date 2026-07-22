'use strict';

const ADMIN_DEFER_PREFIXES = [
  'admin:modules',
  'admin:config:',
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
  if (!shouldPreDefer(interaction) || interaction.deferred || interaction.replied) return;
  await interaction.deferUpdate();
}

module.exports = {
  prepareInteraction,
};
