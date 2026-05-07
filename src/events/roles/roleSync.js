const guildManager = require('../../guild/guildManager');
const antiNukeManager = require('../../security/antiNukeManager');

async function refreshGuildRoles(guild, action) {
  try {
    if (!guild) return;

    await guild.roles.fetch();

    if (typeof guildManager.syncGuildMeta === 'function') {
      guildManager.syncGuildMeta(guild);
    }

    if (typeof guildManager.reloadGuild === 'function') {
      guildManager.reloadGuild(guild.id);
    }

    console.log(`[roleSync] ${action}: refreshed roles for ${guild.name}`);
  } catch (error) {
    console.error(`[roleSync] Failed to refresh roles after ${action}:`, error);
  }
}

async function runAntiNuke(handlerName, ...args) {
  try {
    const handler = antiNukeManager?.[handlerName];

    if (typeof handler !== 'function') {
      return null;
    }

    return await handler(...args);
  } catch (error) {
    console.error(`[roleSync] Anti-Nuke ${handlerName} failed:`, error);
    return null;
  }
}

module.exports = [
  {
    name: 'roleCreate',

    /**
     * Handles role creation.
     *
     * This does two jobs:
     * 1. Sends the create event to Anti-Nuke so dangerous role creation
     *    can be detected, logged, backed up, alerted, and quarantined later.
     * 2. Refreshes Goliath's saved role cache/dashboard metadata.
     *
     * @param {import('discord.js').Role} role
     */
    async execute(role) {
      try {
        if (!role?.guild) return;

        await runAntiNuke('handleRoleCreate', role);

        await refreshGuildRoles(role.guild, `Role created (${role.name})`);
      } catch (error) {
        console.error('[roleSync] roleCreate error:', error);
      }
    },
  },

  {
    name: 'roleUpdate',

    /**
     * Handles role updates.
     *
     * This does two jobs:
     * 1. Sends the update to Anti-Nuke so dangerous permission escalation
     *    can be detected, logged, backed up, alerted, and quarantined.
     * 2. Refreshes Goliath's saved role cache/dashboard metadata.
     *
     * @param {import('discord.js').Role} oldRole
     * @param {import('discord.js').Role} newRole
     */
    async execute(oldRole, newRole) {
      try {
        if (!newRole?.guild) return;

        await runAntiNuke('handleRoleUpdate', oldRole, newRole);

        await refreshGuildRoles(newRole.guild, `Role updated (${newRole.name})`);
      } catch (error) {
        console.error('[roleSync] roleUpdate error:', error);
      }
    },
  },

  {
    name: 'roleDelete',

    /**
     * Handles role deletes.
     *
     * This does two jobs:
     * 1. Sends the delete event to Anti-Nuke so mass role deletion can be
     *    detected, logged, backed up, locked down, alerted, and quarantined.
     * 2. Refreshes Goliath's saved role cache/dashboard metadata.
     *
     * @param {import('discord.js').Role} role
     */
    async execute(role) {
      try {
        if (!role?.guild) return;

        await runAntiNuke('handleRoleDelete', role);

        await refreshGuildRoles(role.guild, `Role deleted (${role.name})`);
      } catch (error) {
        console.error('[roleSync] roleDelete error:', error);
      }
    },
  },
];