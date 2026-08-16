'use strict';

const colourRoles = require('./colourRoles');
const colourRolesHierarchy = require('./colourRolesHierarchy');

async function syncManagedRoleAppearance(guild) {
  const section = colourRoles.getSection(guild.id);
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const record of Object.values(section.managedRoles)) {
    const role = guild.roles.cache.get(record.roleId)
      || await guild.roles.fetch(record.roleId).catch(() => null);

    if (!role || !colourRoles.canManageRole(guild, role)) {
      skipped += 1;
      continue;
    }

    const desiredName = colourRoles.roleNameFor(section, record.label || record.hex);
    const currentPrimary = Number(role.colors?.primaryColor ?? role.color ?? 0);
    const desiredPrimary = colourRoles.hexToInt(record.hex);
    const needsUpdate = role.name !== desiredName
      || currentPrimary !== desiredPrimary
      || role.hoist
      || role.mentionable
      || role.permissions?.bitfield !== 0n;

    if (!needsUpdate) continue;

    try {
      await role.edit({
        name: desiredName,
        colors: { primaryColor: record.hex },
        permissions: [],
        hoist: false,
        mentionable: false,
        reason: 'Goliath Colour Roles appearance sync',
      });
      updated += 1;
    } catch (error) {
      errors.push(`${role.id}: ${error.message || error}`);
    }
  }

  const hierarchy = await colourRolesHierarchy.syncManagedRoleHierarchy(guild);
  return { updated, skipped, errors, hierarchy };
}

module.exports = { syncManagedRoleAppearance };
