'use strict';

const { Events } = require('discord.js');
const colourRolesPanel = require('../../modules/roleStudio/colourRoles/colourRolesPanel');
const colourRolesAppearance = require('../../modules/roleStudio/colourRoles/colourRolesAppearance');
const colourRolesHierarchy = require('../../modules/roleStudio/colourRoles/colourRolesHierarchy');
const roleStudioPanel = require('../../modules/roleStudio/roleStudioPanel');

const APPEARANCE_SYNC_IDS = new Set([
  'admin:colourRoles:styleModal',
  'admin:colourRoles:applyStyleSuggestion',
]);

const HIERARCHY_SYNC_IDS = new Set([
  'admin:colourRoles:anchor',
  'admin:colourRoles:createDividerModal',
  'admin:colourRoles:togglePlacement',
  'admin:colourRoles:toggleGrouped',
  'colourRoles:choose',
  'colourRoles:customModal',
]);

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const customId = String(interaction?.customId || '');

    if (customId === 'admin:studio:roleStudio') {
      interaction.customId = 'admin:roleStudio:handled';
      const payload = await roleStudioPanel.buildRoleStudioPanel(
        interaction.guild,
        interaction.member?.displayName || interaction.user?.username || 'Unknown User'
      );
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.update(payload);
      return;
    }

    if (!customId.startsWith('admin:colourRoles') && !customId.startsWith('colourRoles:')) return;
    await colourRolesPanel.handleColourRolesInteraction(interaction);

    if (APPEARANCE_SYNC_IDS.has(customId) && interaction.guild) {
      await colourRolesAppearance.syncManagedRoleAppearance(interaction.guild)
        .catch((error) => console.warn(`[ColourRoles] Immediate appearance sync failed for ${interaction.guild.id}:`, error.message || error));
      return;
    }

    if (HIERARCHY_SYNC_IDS.has(customId) && interaction.guild) {
      await colourRolesHierarchy.syncManagedRoleHierarchy(interaction.guild)
        .catch((error) => console.warn(`[ColourRoles] Immediate hierarchy sync failed for ${interaction.guild.id}:`, error.message || error));
    }
  },
};
