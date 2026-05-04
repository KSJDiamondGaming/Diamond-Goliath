const guildManager = require('../../guild/guildManager');

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

module.exports = [
  {
    name: 'roleCreate',

    async execute(role) {
      await refreshGuildRoles(role.guild, `Role created (${role.name})`);
    },
  },

  {
    name: 'roleUpdate',

    async execute(oldRole, newRole) {
      await refreshGuildRoles(newRole.guild, `Role updated (${newRole.name})`);
    },
  },

  {
    name: 'roleDelete',

    async execute(role) {
      await refreshGuildRoles(role.guild, `Role deleted (${role.name})`);
    },
  },
];