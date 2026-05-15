const guildManager = require('../../guild/guildManager');
const securitySystem = require('../../security/securitySystem');

const ROLE_SYNC_LOG_COOLDOWN_MS = 5000;
const roleSyncLogState = new Map();

function shouldLogRoleSync(guildId) {
  const now = Date.now();
  const last = roleSyncLogState.get(guildId) || 0;

  if (now - last < ROLE_SYNC_LOG_COOLDOWN_MS) {
    return false;
  }

  roleSyncLogState.set(guildId, now);
  return true;
}

async function refreshGuildRoles(guild) {
  try {
    if (!guild) return;

    await guild.roles.fetch();

    if (typeof guildManager.syncGuildMeta === 'function') {
      guildManager.syncGuildMeta(guild);
    }

    if (typeof guildManager.reloadGuild === 'function') {
      guildManager.reloadGuild(guild.id);
    }

    if (shouldLogRoleSync(guild.id)) {
      console.log(`[roleSync] Role cache synced for ${guild.name}`);
    }
  } catch (error) {
    console.error(`[roleSync] Failed to refresh roles for ${guild?.name || 'Unknown Guild'}:`, error);
  }
}

async function runAntiNuke(handlerName, ...args) {
  try {
    const handler = securitySystem?.[handlerName];

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

    async execute(role) {
      try {
        if (!role?.guild) return;

        await runAntiNuke('handleRoleCreate', role);
        await refreshGuildRoles(role.guild);
      } catch (error) {
        console.error('[roleSync] roleCreate error:', error);
      }
    },
  },

  {
    name: 'roleUpdate',

    async execute(oldRole, newRole) {
      try {
        if (!newRole?.guild) return;

        await runAntiNuke('handleRoleUpdate', oldRole, newRole);
        await refreshGuildRoles(newRole.guild);
      } catch (error) {
        console.error('[roleSync] roleUpdate error:', error);
      }
    },
  },

  {
    name: 'roleDelete',

    async execute(role) {
      try {
        if (!role?.guild) return;

        await runAntiNuke('handleRoleDelete', role);
        await refreshGuildRoles(role.guild);
      } catch (error) {
        console.error('[roleSync] roleDelete error:', error);
      }
    },
  },
];