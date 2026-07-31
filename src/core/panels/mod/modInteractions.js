'use strict';

// Unified moderation interaction entry point.
// Button/select and modal implementations are being consolidated behind this
// module so modPanel has one interaction dependency during the refactor.

const { routeModInteraction } = require('./modInteractionRouter');
const { routeModModal } = require('./modModalRouter');

function isModCustomId(customId) {
  const id = String(customId || '');
  return id.startsWith('mod_') || id.startsWith('mod:');
}

async function handleModInteraction(interaction, navState = null) {
  if (!interaction?.customId || !isModCustomId(interaction.customId)) return false;

  if (interaction.customId.startsWith('nav|')) return false;

  if (interaction.isModalSubmit?.()) {
    return routeModModal(interaction, navState);
  }

  return routeModInteraction(interaction, navState);
}

module.exports = {
  isModCustomId,
  handleModInteraction,
};
