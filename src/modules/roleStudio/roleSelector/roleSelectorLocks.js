'use strict';

// Process-local keyed queue for Role Selector mutations. Goliath currently runs
// one PM2 process per environment, so this is the correct coordination boundary.
const tails = new Map();
const HARDENING_PATCH_KEY = Symbol.for('goliath.roleSelector.hardeningPatchInstalled');

function cleanPart(value, fallback = 'global') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

function lockKey(guildId, scope = 'guild', identity = '') {
  return [cleanPart(guildId), cleanPart(scope), cleanPart(identity, '-')].join(':');
}

async function withKeyedLock(key, task) {
  if (typeof task !== 'function') throw new TypeError('Role Selector lock task must be a function.');
  const safeKey = cleanPart(key);
  const previous = tails.get(safeKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => current);
  tails.set(safeKey, tail);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (tails.get(safeKey) === tail) tails.delete(safeKey);
  }
}

function withRoleSelectorLock(guildId, scope, task, identity = '') { return withKeyedLock(lockKey(guildId, scope, identity), task); }
function withGuildLock(guildId, task) { return withRoleSelectorLock(guildId, 'guild', task); }
function withMemberGroupLock(guildId, memberId, groupId, task) { return withRoleSelectorLock(guildId, 'member-group', task, `${cleanPart(memberId)}:${cleanPart(groupId)}`); }
function withManagedRoleLock(guildId, identity, task) { return withRoleSelectorLock(guildId, 'managed-role', task, identity); }
function withDeploymentLock(guildId, task) { return withRoleSelectorLock(guildId, 'deployment', task); }
function pendingLockCount() { return tails.size; }

async function drainRetiredManagedRoles(service, guild) {
  const section = service.getSection(guild.id);
  const retired = Array.isArray(section.identity?.retiredManagedRoles) ? section.identity.retiredManagedRoles : [];
  for (const entry of retired) {
    if (!entry?.roleId) continue;
    const role = guild.roles.cache.get(entry.roleId) || await guild.roles.fetch(entry.roleId).catch(() => null);
    if (!role || !service.canManageRole(guild, role)) continue;
    for (const member of [...role.members.values()]) {
      if (member.user?.bot) continue;
      await member.roles.remove(role, 'Goliath Role Selector retired managed role').catch(() => null);
    }
  }
}

function assertGroupCapacity(service, guildId, input = {}) {
  const requestedId = String(input.id || input.key || '').trim();
  const existing = requestedId ? service.getGroup(guildId, requestedId) : null;
  if (!existing && service.listGroups(guildId).length >= service.MAX_COMPONENT_OPTIONS) {
    throw new Error(`Role Selector supports up to ${service.MAX_COMPONENT_OPTIONS} total categories, including Colours.`);
  }
}

async function eagerPruneUnusedManagedRoles(roleSelector, service, guild, groupId) {
  const section = roleSelector.getSection(guild.id);
  if (section.cleanup?.deleteUnusedRoles === false) return { deleted: 0, cleared: 0 };
  const group = section.groups?.[groupId];
  if (!group) return { deleted: 0, cleared: 0 };

  let deleted = 0;
  let cleared = 0;

  if (group.type === 'colour') {
    const managedRoles = JSON.parse(JSON.stringify(group.managedRoles || {}));
    let changed = false;

    for (const [hex, record] of Object.entries(managedRoles)) {
      if (!record?.roleId) continue;
      const role = guild.roles.cache.get(record.roleId) || await guild.roles.fetch(record.roleId).catch(() => null);
      if (!role) {
        delete managedRoles[hex];
        cleared += 1;
        changed = true;
        continue;
      }
      const members = role.members.filter((member) => !member.user?.bot).size;
      if (members > 0 || !roleSelector.canManageRole(guild, role)) continue;
      const removed = await role.delete('Goliath Role Selector unused role after member selection change').then(() => true).catch(() => false);
      if (!removed) continue;
      delete managedRoles[hex];
      deleted += 1;
      changed = true;
    }

    if (changed) {
      roleSelector.saveGroup(guild.id, { ...group, managedRoles }, { action: 'role_selector_eager_unused_cleanup' });
    }
  } else {
    const options = JSON.parse(JSON.stringify(group.options || []));
    let changed = false;

    for (const option of options) {
      if (!option?.roleId || option.managed === false) continue;
      const role = guild.roles.cache.get(option.roleId) || await guild.roles.fetch(option.roleId).catch(() => null);
      if (!role) {
        option.roleId = null;
        option.unusedSince = null;
        cleared += 1;
        changed = true;
        continue;
      }
      const members = role.members.filter((member) => !member.user?.bot).size;
      if (members > 0 || !roleSelector.canManageRole(guild, role)) continue;
      const removed = await role.delete('Goliath Role Selector unused role after member selection change').then(() => true).catch(() => false);
      if (!removed) continue;
      option.roleId = null;
      option.unusedSince = null;
      deleted += 1;
      changed = true;
    }

    if (changed) {
      roleSelector.saveGroup(guild.id, { ...group, options }, { action: 'role_selector_eager_unused_cleanup' });
    }
  }

  if (deleted > 0) {
    roleSelector.updateSection(guild.id, (current) => ({
      ...current,
      analytics: {
        ...current.analytics,
        rolesDeleted: Number(current.analytics?.rolesDeleted || 0) + deleted,
      },
    }), { action: 'role_selector_eager_unused_cleanup_analytics' });
  }

  return { deleted, cleared };
}

function installHardeningPatch() {
  if (globalThis[HARDENING_PATCH_KEY]) return;
  globalThis[HARDENING_PATCH_KEY] = true;

  queueMicrotask(() => {
    try {
      const roleSelector = require('./roleSelector');
      const service = require('./roleSelectorService');

      // Patch the service itself where additional compatibility guards are needed.
      // Never blanket-copy service back onto roleSelector: service deliberately calls
      // the original base primitives (saveGroup/updateSection/sync/etc.). Overwriting
      // those primitives makes the service recursively call itself until the stack
      // overflows.
      const originalSaveGroup = service.saveGroup;
      service.saveGroup = function capacitySafeGroupSave(guildId, input, meta = {}) {
        assertGroupCapacity(service, guildId, input);
        return originalSaveGroup(guildId, input, meta);
      };

      const originalSaveGroupSafe = service.saveGroupSafe;
      service.saveGroupSafe = async function fullySafeGroupSave(guild, input, meta = {}) {
        assertGroupCapacity(service, guild.id, input);
        const result = await originalSaveGroupSafe(guild, input, meta);
        await drainRetiredManagedRoles(service, guild);
        await service.cleanupUnused(guild).catch(() => null);
        return result;
      };

      const originalApplyStandardSelection = service.applyStandardSelection;
      service.applyStandardSelection = async function guardedStandardSelection(guild, member, groupId, optionIds = []) {
        const group = service.getGroup(guild.id, groupId);
        if (group && !group.allowRemove && (!Array.isArray(optionIds) || optionIds.length === 0)) {
          const hasCurrentSelectorRole = service.roleIdsForGroup(group).some((roleId) => member.roles?.cache?.has(roleId));
          if (hasCurrentSelectorRole) throw new Error('This selector does not allow clearing your selection.');
        }
        const result = await originalApplyStandardSelection(guild, member, groupId, optionIds);
        await service.withMutationLock(guild.id, () => eagerPruneUnusedManagedRoles(roleSelector, service, guild, String(groupId || '')));
        return result;
      };

      const originalApplyColourSelection = service.applyColourSelection;
      service.applyColourSelection = async function eagerCleanupColourSelection(guild, member, hexValue, label = null) {
        const result = await originalApplyColourSelection(guild, member, hexValue, label);
        await service.withMutationLock(guild.id, () => eagerPruneUnusedManagedRoles(roleSelector, service, guild, service.COLOUR_GROUP_ID));
        return result;
      };

      const originalClearSelection = service.clearSelection;
      service.clearSelection = async function eagerCleanupClearSelection(guild, member, groupId) {
        const result = await originalClearSelection(guild, member, groupId);
        await service.withMutationLock(guild.id, () => eagerPruneUnusedManagedRoles(roleSelector, service, guild, String(groupId || '')));
        return result;
      };

      // Compatibility surface for modules that still import ./roleSelector. Only
      // methods that do NOT depend on the same mutable base method are exposed here.
      // Base primitives such as saveGroup, saveSection, updateSection, removeGroup,
      // cleanupUnused, deleteManagedGroupRoles and syncManagedRole* must stay intact.
      const safeCompatibilityMethods = [
        'applyColourSelection',
        'applyStandardSelection',
        'clearSelection',
        'countManagedRoleReferences',
        'handleMemberRemove',
        'handleRoleDelete',
        'handleRoleUpdate',
        'isGroupMemberUsable',
        'reconcileAllMembers',
        'reconcileMemberFromDiscord',
        'runMaintenance',
        'saveGroupSafe',
        'setAnchorRole',
        'withMaintenanceLock',
        'withMutationLock',
      ];
      roleSelector.MAX_COMPONENT_OPTIONS = service.MAX_COMPONENT_OPTIONS;
      for (const name of safeCompatibilityMethods) {
        if (typeof service[name] === 'function') roleSelector[name] = service[name];
      }

      try {
        const health = require('./roleSelectorHealth');
        if (!health.__roleSelectorHardeningWrapped) {
          const originalBuildHealth = health.buildHealth;
          const originalRepair = health.repair;

          health.buildHealth = async function hardenedBuildHealth(guild) {
            const result = await originalBuildHealth(guild);
            const section = service.getSection(guild.id);
            result.managedRoleCount = service.countManagedRoleReferences(section);
            const usableGroups = service.listGroups(guild.id).filter(service.isGroupMemberUsable).length;
            if (usableGroups > service.MAX_COMPONENT_OPTIONS) result.warnings.push(`${usableGroups} member-usable selector groups exceed Discord's ${service.MAX_COMPONENT_OPTIONS}-category limit.`);
            if (service.listGroups(guild.id).length > service.MAX_COMPONENT_OPTIONS) result.warnings.push(`${service.listGroups(guild.id).length} stored selector groups exceed the Discord admin/member menu limit of ${service.MAX_COMPONENT_OPTIONS}.`);
            result.healthy = result.issues.length === 0 && result.warnings.length === 0;
            return result;
          };

          health.repair = async function hardenedRepair(guild) {
            await originalRepair(guild);
            await service.reconcileAllMembers(guild);
            await drainRetiredManagedRoles(service, guild);
            await service.cleanupUnused(guild);
            return health.buildHealth(guild);
          };

          Object.defineProperty(health, '__roleSelectorHardeningWrapped', { value: true });
        }
      } catch (error) {
        console.warn('[RoleSelector] Health hardening patch failed:', error.message || error);
      }
    } catch (error) {
      globalThis[HARDENING_PATCH_KEY] = false;
      console.error('[RoleSelector] Failed to install hardening service:', error);
    }
  });
}

installHardeningPatch();

module.exports = {
  lockKey,
  pendingLockCount,
  withDeploymentLock,
  withGuildLock,
  withKeyedLock,
  withManagedRoleLock,
  withMemberGroupLock,
  withRoleSelectorLock,
};