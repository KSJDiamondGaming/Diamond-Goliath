'use strict';

const { Events } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const roleSelector = require('../../modules/roleStudio/roleSelector/roleSelector');

const INTERVAL_MS = 60 * 60 * 1000;
const TIMER_KEY = Symbol.for('goliath.roleSelector.maintenanceTimer');

async function maintainGuild(guild) {
  if (!guildManager.isModuleEnabled(guild.id, roleSelector.MODULE)) return;
  await roleSelector.syncManagedRoleAppearance(guild)
    .catch((error) => console.warn(`[RoleSelector] Appearance sync failed for ${guild.id}:`, error.message || error));
  await roleSelector.syncManagedRoleHierarchy(guild)
    .catch((error) => console.warn(`[RoleSelector] Hierarchy sync failed for ${guild.id}:`, error.message || error));
  await roleSelector.cleanupUnused(guild)
    .catch((error) => console.warn(`[RoleSelector] Cleanup failed for ${guild.id}:`, error.message || error));
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
      maintainAll(client).catch((error) => console.warn('[RoleSelector] Scheduled maintenance failed:', error.message || error));
    }, INTERVAL_MS);
    client[TIMER_KEY].unref?.();
  },
};
