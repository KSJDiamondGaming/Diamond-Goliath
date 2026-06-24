const guildManager = require('../../core/guild/guildManager');
const securitySystem = require('../../core/security/securitySystem');
const {
  emitSyncEvent,
} = require('../../server/sockets/socketHub');

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

async function getLiveGuild(guild) {
  if (!guild?.client || !guild?.id) {
    return null;
  }

  return guild.client.guilds.fetch(guild.id).catch(() => null);
}

function emitRoleSyncEvent(guild, event, role, extra = {}) {
  const guildId = guild?.id || role?.guild?.id;

  if (!guildId) return null;

  return emitSyncEvent(event, guildId, {
    module: 'roles',
    scope: 'roles',
    roleId: role?.id || null,
    roleName: role?.name || null,
    roleColor: role?.hexColor || null,
    rolePosition: Number.isFinite(role?.position) ? role.position : null,
    ...extra,
  });
}

async function refreshGuildRoles(guild, context = {}) {
  try {
    if (!guild) return;

    const liveGuild = await getLiveGuild(guild);

    if (!liveGuild) {
      console.warn(
        `[roleSync] Skipped ${guild.name || guild.id}: guild is not available.`
      );
      return;
    }

    await liveGuild.roles.fetch();

    if (typeof guildManager.syncGuildMeta === 'function') {
      guildManager.syncGuildMeta(liveGuild);
    }

    if (typeof guildManager.reloadGuild === 'function') {
      guildManager.reloadGuild(liveGuild.id);
    }

    if (context.event && context.role) {
      emitRoleSyncEvent(liveGuild, context.event, context.role, {
        syncedAt: new Date().toISOString(),
      });
    }

    if (shouldLogRoleSync(liveGuild.id)) {
      console.log(`[roleSync] Role cache synced for ${liveGuild.name}`);
    }
  } catch (error) {
    console.error(
      `[roleSync] Failed to refresh roles for ${guild?.name || 'Unknown Guild'}:`,
      error
    );
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await refreshGuildRoles(role.guild, {
          event: 'role.created',
          role,
        });
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
        await refreshGuildRoles(newRole.guild, {
          event: 'role.updated',
          role: newRole,
          oldRoleName: oldRole?.name || null,
        });
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
        await refreshGuildRoles(role.guild, {
          event: 'role.deleted',
          role,
        });
      } catch (error) {
        console.error('[roleSync] roleDelete error:', error);
      }
    },
  },
];