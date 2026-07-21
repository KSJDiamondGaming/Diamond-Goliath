'use strict';

// Legacy path retained as the compatibility router used by interactionCreate.js.
// The Role Studio hub owns the root route; child systems are delegated to their
// canonical panels without reintroducing a second Admin module registry.
const reactionRolesPanel = require('../roleStudio/reactionRoles/reactionRolesPanel');
const roleStudioPanel = require('../roleStudio/roleStudioPanel');
const temporaryRolesPanel = require('../roleStudio/temporaryRoles/temporaryRolesPanel');

function displayName(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

async function updateInteraction(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }

  await interaction.update(payload);
  return true;
}

async function handleReactionRolesAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (customId === 'admin:reactionRoles') {
    const payload = await roleStudioPanel.buildRoleStudioPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (customId === 'admin:reactionRoles:analytics') {
    const payload = await roleStudioPanel.buildRoleAnalyticsPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (customId === 'admin:reactionRoles:health') {
    const payload = await roleStudioPanel.buildRoleHealthPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (customId.startsWith(temporaryRolesPanel.PREFIX)) {
    return temporaryRolesPanel.handleTemporaryRolesInteraction(interaction);
  }

  if (customId === 'admin:reactionRoles:open') {
    if (typeof reactionRolesPanel.buildReactionRolesAdminPanel !== 'function') {
      throw new Error('Reaction Roles panel builder is unavailable.');
    }

    const payload = await reactionRolesPanel.buildReactionRolesAdminPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (typeof reactionRolesPanel.handleReactionRolesAdminInteraction !== 'function') {
    return false;
  }

  return reactionRolesPanel.handleReactionRolesAdminInteraction(interaction);
}

module.exports = {
  ...reactionRolesPanel,
  handleReactionRolesAdminInteraction,
};
