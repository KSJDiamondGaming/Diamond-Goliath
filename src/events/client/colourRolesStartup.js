'use strict';

const { Events } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const colourRoles = require('../../modules/roleStudio/colourRoles/colourRoles');

module.exports = {
  name: Events.ClientReady,
  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      if (!guildManager.isModuleEnabled(guild.id, colourRoles.MODULE)) continue;
      await colourRoles.markAndCleanupUnused(guild).catch((error) => console.warn(`[ColourRoles] Cleanup failed for ${guild.id}:`, error.message || error));
      await colourRoles.reorderManagedRoles(guild).catch((error) => console.warn(`[ColourRoles] Reorder failed for ${guild.id}:`, error.message || error));
    }
  },
};
