'use strict';

// src/modules/roles/roleStartup.js

const roleManager = require('./roleManager');
const roleStore = require('./roleStore');

async function startupRoles(client) {
  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  let enabledGuilds = 0;
  let timedRoleRules = 0;

  for (const guild of guilds) {
    const section = roleStore.getRolesSection(guild.id);

    if (section.enabled === false) continue;

    enabledGuilds += 1;
    timedRoleRules += roleStore
      .getTimedRoles(guild.id)
      .filter((rule) => rule.enabled !== false)
      .length;
  }

  roleManager.startTimedRoleScheduler(client);

  return {
    enabledGuilds,
    timedRoleRules,
  };
}

module.exports = {
  startupRoles,
};
