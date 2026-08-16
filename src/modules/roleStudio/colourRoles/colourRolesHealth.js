'use strict';

const { PermissionFlagsBits } = require('discord.js');
const colourRoles = require('./colourRoles');
const guildManager = require('../../../core/guild/guildManager');

async function buildHealth(guild) {
  const section = colourRoles.getSection(guild.id);
  const issues = [];
  const warnings = [];
  const missingManagedHexes = [];
  const unmanageableRoleIds = [];
  const me = guild.members.me;

  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) issues.push('Goliath requires Manage Roles for Colour Roles.');

  let anchor = null;
  if (section.style.anchorRoleId) {
    anchor = guild.roles.cache.get(section.style.anchorRoleId) || await guild.roles.fetch(section.style.anchorRoleId).catch(() => null);
    if (!anchor) issues.push('The configured Colour Roles divider/anchor role no longer exists.');
    else if (anchor.position >= me?.roles?.highest?.position) warnings.push('The selected anchor is at or above Goliath. Colour roles cannot be positioned around it safely.');
  } else {
    warnings.push('No divider/anchor role is selected. Colour roles will remain where Discord creates them until an anchor is configured.');
  }

  for (const [hex, record] of Object.entries(section.managedRoles)) {
    const role = guild.roles.cache.get(record.roleId) || await guild.roles.fetch(record.roleId).catch(() => null);
    if (!role) {
      missingManagedHexes.push(hex);
      warnings.push(`${record.label || hex}: managed Discord role is missing.`);
      continue;
    }
    if (role.managed || !me || role.position >= me.roles.highest.position) {
      unmanageableRoleIds.push(role.id);
      issues.push(`${role.name}: role cannot be managed by Goliath because of role hierarchy or integration ownership.`);
    }
    if (role.permissions?.bitfield && role.permissions.bitfield !== 0n) warnings.push(`${role.name}: Colour Roles should be cosmetic-only, but this role has permissions.`);
    if (role.hoist) warnings.push(`${role.name}: role is hoisted. Colour Roles default to non-hoisted cosmetic roles.`);
    if (role.mentionable) warnings.push(`${role.name}: role is mentionable. Colour Roles default to non-mentionable roles.`);
  }

  const usage = await colourRoles.getUsage(guild);
  return {
    healthy: issues.length === 0,
    enabled: guildManager.isModuleEnabled(guild.id, colourRoles.MODULE),
    issues,
    warnings,
    missingManagedHexes,
    unmanageableRoleIds,
    anchorRoleId: anchor?.id || null,
    anchorRoleName: anchor?.name || null,
    managedRoleCount: Object.keys(section.managedRoles).length,
    totalUsing: usage.totalUsing,
    totalMembers: usage.totalMembers,
    checkedAt: new Date().toISOString(),
  };
}

async function repair(guild, meta = {}) {
  const before = await buildHealth(guild);
  let section = colourRoles.getSection(guild.id);
  const managedRoles = { ...section.managedRoles };
  for (const hex of before.missingManagedHexes) delete managedRoles[hex];

  let anchorRoleId = section.style.anchorRoleId;
  if (anchorRoleId && !guild.roles.cache.has(anchorRoleId)) anchorRoleId = null;

  section = colourRoles.updateSection(guild.id, (current) => ({
    ...current,
    managedRoles,
    style: { ...current.style, anchorRoleId },
  }), { ...meta, action: 'colour_roles_repair' });

  for (const record of Object.values(section.managedRoles)) {
    const role = guild.roles.cache.get(record.roleId);
    if (!colourRoles.canManageRole(guild, role)) continue;
    const patch = {};
    if (role.hoist) patch.hoist = false;
    if (role.mentionable) patch.mentionable = false;
    if (role.permissions?.bitfield !== 0n) patch.permissions = [];
    if (Object.keys(patch).length) await role.edit({ ...patch, reason: 'Goliath Colour Roles health repair' }).catch(() => null);
  }

  if (section.style.anchorRoleId) await colourRoles.reorderManagedRoles(guild);
  await colourRoles.markAndCleanupUnused(guild);
  return { before, health: await buildHealth(guild) };
}

module.exports = { buildHealth, repair };
