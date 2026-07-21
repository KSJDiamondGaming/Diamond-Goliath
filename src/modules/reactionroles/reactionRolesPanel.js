'use strict';

// Compatibility router used by the central interaction handler.
// Keep the Role Studio hub independent from child-panel load failures: child
// modules are required only when their own routes are opened.
const roleStudioPanel = require('../roleStudio/roleStudioPanel');

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

function loadReactionRolesPanel() {
  try {
    return require('../roleStudio/reactionRoles/reactionRolesPanel');
  } catch (error) {
    console.error('[RoleStudio] Reaction Roles panel failed to load:', error?.stack || error?.message || error);
    throw new Error(`Reaction Roles is unavailable: ${String(error?.message || error).slice(0, 250)}`);
  }
}

function loadTemporaryRolesPanel() {
  try {
    return require('../roleStudio/temporaryRoles/temporaryRolesPanel');
  } catch (error) {
    console.error('[RoleStudio] Temporary Roles panel failed to load:', error?.stack || error?.message || error);
    throw new Error(`Temporary Roles is unavailable: ${String(error?.message || error).slice(0, 250)}`);
  }
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

  if (customId.startsWith('admin:reactionRoles:temporary')) {
    const temporaryRolesPanel = loadTemporaryRolesPanel();
    return temporaryRolesPanel.handleTemporaryRolesInteraction(interaction);
  }

  const reactionRolesPanel = loadReactionRolesPanel();

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
  handleReactionRolesAdminInteraction,
};
