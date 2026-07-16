'use strict';

const roleStore = require('./roleStore');

async function initializeRoles(client) {
  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  let enabledGuilds = 0;
  let legacyPanels = 0;

  for (const guild of guilds) {
    const section = roleStore.getRolesSection(guild.id);
    if (section.enabled === false) continue;
    enabledGuilds += 1;
    legacyPanels += Object.keys(section.reactionPanels || {}).length;
  }

  return {
    enabledGuilds,
    legacyPanels,
    timedRolesMovedToCanonicalModule: true,
  };
}

module.exports = { initializeRoles };
