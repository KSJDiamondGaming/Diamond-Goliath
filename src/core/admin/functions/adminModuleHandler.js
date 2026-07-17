'use strict';

const moduleAdminPanels = require('./moduleAdminPanels');
const {
  buildInviteStudioPayload,
  handleInviteStudioInteraction,
} = require('../../../modules/invites/invitesAdminPanel');

function isAdminModuleInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  return customId === 'admin:invites'
    || customId === 'admin:modules'
    || customId.startsWith('admin:modules:page:')
    || customId.startsWith('admin:module:')
    || customId.startsWith('invites:');
}

async function updateOrEdit(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

async function handleAdminModuleInteraction(interaction) {
  if (!interaction?.guildId || !isAdminModuleInteraction(interaction)) return false;

  const customId = String(interaction.customId || '');
  if (customId === 'admin:invites') {
    return updateOrEdit(interaction, buildInviteStudioPayload(interaction));
  }
  if (customId.startsWith('invites:')) {
    return handleInviteStudioInteraction(interaction);
  }
  return moduleAdminPanels.handleModuleAdminInteraction(interaction);
}

module.exports = {
  isAdminModuleInteraction,
  handleAdminModuleInteraction,
};
