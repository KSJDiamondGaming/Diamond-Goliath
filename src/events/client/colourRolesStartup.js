'use strict';

const { Events } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const colourRoles = require('../../modules/roleStudio/colourRoles/colourRoles');

const INTERVAL_MS = 60 * 60 * 1000;
const TIMER_KEY = Symbol.for('goliath.colourRoles.maintenanceTimer');

async function maintainGuild(guild) {
  if (!guildManager.isModuleEnabled(guild.id, colourRoles.MODULE)) return;
  await colourRoles.markAndCleanupUnused(guild)
    .catch((error) => console.warn(`[ColourRoles] Cleanup failed for ${guild.id}:`, error.message || error));
  await colourRoles.reorderManagedRoles(guild)
    .catch((error) => console.warn(`[ColourRoles] Reorder failed for ${guild.id}:`, error.message || error));
}

async function maintainAll(client) {
  for (const guild of client.guilds.cache.values()) await maintainGuild(guild);
}

module.exports = {
  name: Events.ClientReady,
  async execute(client) {
    await maintainAll(client);

    if (client[TIMER_KEY]) clearInterval(client[TIMER_KEY]);
    client[TIMER_KEY] = setInterval(() => {
      maintainAll(client).catch((error) => console.warn('[ColourRoles] Scheduled maintenance failed:', error.message || error));
    }, INTERVAL_MS);
    client[TIMER_KEY].unref?.();
  },
};
