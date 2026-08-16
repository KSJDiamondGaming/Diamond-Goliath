'use strict';

const colourRoles = require('./colourRoles');

async function syncManagedRoleHierarchy(guild) {
  const section = colourRoles.getSection(guild.id);
  if (!section.style.keepGrouped || !section.style.anchorRoleId) {
    return { moved: 0, skipped: true, reason: 'grouping_or_anchor_disabled' };
  }

  await guild.roles.fetch().catch(() => null);

  const anchor = guild.roles.cache.get(section.style.anchorRoleId);
  if (!anchor) return { moved: 0, skipped: true, reason: 'anchor_missing' };

  const managedRecords = colourRoles.sortManagedRecords(section);
  const managedRoles = managedRecords
    .map((record) => guild.roles.cache.get(record.roleId))
    .filter(Boolean);

  if (!managedRoles.length) return { moved: 0, skipped: true, reason: 'no_managed_roles' };
  if (managedRoles.some((role) => !colourRoles.canManageRole(guild, role))) {
    return { moved: 0, skipped: true, reason: 'unmanageable_managed_role' };
  }

  const managedIds = new Set(managedRoles.map((role) => role.id));
  if (managedIds.has(anchor.id)) {
    return { moved: 0, skipped: true, reason: 'anchor_is_managed_colour_role' };
  }

  const ascendingBase = [...guild.roles.cache.values()]
    .filter((role) => !managedIds.has(role.id))
    .sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));

  const anchorIndex = ascendingBase.findIndex((role) => role.id === anchor.id);
  if (anchorIndex < 0) return { moved: 0, skipped: true, reason: 'anchor_not_in_role_list' };

  if (anchor.id === guild.id && section.style.placement === 'below') {
    return { moved: 0, skipped: true, reason: 'cannot_place_below_everyone' };
  }

  // Discord positions are bottom-up. Reversing the rainbow array makes the
  // visible top-down role manager order Red → Orange → ... → White.
  const managedAscending = [...managedRoles].reverse();
  const insertionIndex = section.style.placement === 'above'
    ? anchorIndex + 1
    : anchorIndex;

  const finalOrder = [
    ...ascendingBase.slice(0, insertionIndex),
    ...managedAscending,
    ...ascendingBase.slice(insertionIndex),
  ];

  const botHighestId = guild.members.me?.roles?.highest?.id;
  const botIndex = finalOrder.findIndex((role) => role.id === botHighestId);
  const positions = managedRoles.map((role) => ({
    role: role.id,
    position: finalOrder.findIndex((item) => item.id === role.id),
  }));

  if (botIndex >= 0 && positions.some((item) => item.position >= botIndex)) {
    return { moved: 0, skipped: true, reason: 'target_at_or_above_bot_role' };
  }

  const changed = positions.filter((item) => guild.roles.cache.get(item.role)?.position !== item.position);
  if (!changed.length) return { moved: 0, skipped: false };

  await guild.roles.setPositions(positions);
  return { moved: changed.length, skipped: false };
}

module.exports = { syncManagedRoleHierarchy };
