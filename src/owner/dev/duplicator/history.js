'use strict';

const {
  GuildChannel,
  PermissionFlagsBits,
  PermissionOverwriteManager,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');

const MAX_HISTORY = 100;
const OVERWRITE_RESCUE_PATCH = Symbol.for('goliath.duplicator.bulk-delete-overwrite-control-rescue');
const DELETE_RESCUE_PATCH = Symbol.for('goliath.duplicator.bulk-delete-delete-control-rescue');
const rescueByGuild = new Map();
const CONTROL_BITS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles;

function readConfig(controlGuildId) {
  const modules = guildManager.getGuildSection(controlGuildId, 'modules', {});
  const duplicator = modules.duplicator || {};
  const transferHistory = Array.isArray(duplicator.transferHistory) ? duplicator.transferHistory : [];
  return { modules, duplicator, transferHistory };
}

function saveHistory(controlGuildId, history, guildOrMeta = {}) {
  const { modules, duplicator } = readConfig(controlGuildId);
  const next = history.slice(0, MAX_HISTORY);
  guildManager.replaceGuildSection(controlGuildId, 'modules', {
    ...modules,
    duplicator: {
      ...duplicator,
      transferHistory: next,
    },
  }, guildOrMeta);
  return next;
}

function makeId(prefix = 'TR') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function isBulkDeleteReason(reason) {
  return String(reason || '').startsWith('Goliath Duplicator bulk delete');
}

function isAccessError(error) {
  return [50001, 50013].includes(Number(error?.code));
}

function botOnlyRoleScore(role) {
  const name = String(role?.name || '').toLowerCase();
  let score = 0;
  if (/^operations?$/.test(name)) score += 200;
  if (/goliath|bot/.test(name)) score += 80;
  if (/owner|staff/.test(name)) score += 20;
  score += Math.min(10, Number(role?.position || 0) / 1000);
  return score;
}

async function releaseTemporaryControl(guildId) {
  const key = String(guildId || '');
  const state = rescueByGuild.get(key);
  if (!state) return false;
  rescueByGuild.delete(key);
  if (state.timer) clearTimeout(state.timer);
  if (state.preExisting || !state.roleId) return true;

  const guild = state.guild;
  if (!guild) return false;
  try {
    const role = guild.roles.cache.get(state.roleId) || await guild.roles.fetch(state.roleId).catch(() => null);
    if (!role) return true;
    await role.setPermissions(BigInt(state.originalPermissions), `Goliath Duplicator bulk-delete control rescue cleanup (${state.roleName})`);
    return true;
  } catch (error) {
    console.error('[Duplicator] Failed to restore temporary bulk-delete control permissions:', error);
    return false;
  }
}

function scheduleTemporaryControlRelease(guildId, delayMs = 90_000) {
  const state = rescueByGuild.get(String(guildId || ''));
  if (!state || state.preExisting) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    void releaseTemporaryControl(guildId);
  }, delayMs);
  if (typeof state.timer.unref === 'function') state.timer.unref();
}

async function acquireTemporaryControl(guild) {
  if (!guild) return null;
  const guildId = String(guild.id);
  const existing = rescueByGuild.get(guildId);
  if (existing) {
    if (!existing.preExisting) scheduleTemporaryControlRelease(guildId);
    return existing;
  }

  await guild.roles.fetch().catch(() => null);
  await guild.members.fetchMe().catch(() => null);
  const me = guild.members.me;
  if (!me) return null;

  const hasControl = me.permissions.has(PermissionFlagsBits.ViewChannel)
    && me.permissions.has(PermissionFlagsBits.ManageChannels)
    && me.permissions.has(PermissionFlagsBits.ManageRoles);
  if (hasControl) {
    const state = {
      guild,
      roleId: null,
      roleName: 'existing control permissions',
      acquiredAt: Date.now(),
      preExisting: true,
      timer: null,
    };
    rescueByGuild.set(guildId, state);
    return state;
  }

  // Never grant or attach Administrator. The rescue is deliberately least-privilege:
  // only View Channel + Manage Channels + Manage Roles, and only on a non-managed role
  // already assigned exclusively to Goliath. The exact original role bitfield is restored.
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return null;

  const highest = Number(me.roles.highest?.position || 0);
  const candidates = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .filter((role) => !role.managed)
    .filter((role) => Number(role.position || 0) < highest)
    .filter((role) => me.roles.cache.has(role.id))
    .filter((role) => role.members?.size === 1 && role.members.has(me.id))
    .sort((a, b) => botOnlyRoleScore(b) - botOnlyRoleScore(a));

  for (const role of candidates) {
    const originalPermissions = role.permissions.bitfield;
    const elevatedPermissions = originalPermissions | CONTROL_BITS;
    try {
      await role.setPermissions(
        elevatedPermissions,
        `Goliath Duplicator temporary bulk-delete control rescue (${guildId})`,
      );
      await guild.members.fetchMe().catch(() => null);
      const refreshed = guild.members.me;
      if (!refreshed?.permissions?.has(PermissionFlagsBits.ManageChannels)
        || !refreshed?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
        await role.setPermissions(originalPermissions, 'Goliath Duplicator control rescue verification rollback').catch(() => null);
        continue;
      }

      const state = {
        guild,
        roleId: role.id,
        roleName: role.name,
        acquiredAt: Date.now(),
        preExisting: false,
        originalPermissions: originalPermissions.toString(),
        timer: null,
      };
      rescueByGuild.set(guildId, state);
      scheduleTemporaryControlRelease(guildId);
      console.warn(`[Duplicator] Temporary least-privilege bulk-delete control enabled with ${role.name} (${role.id}) in ${guild.name} (${guild.id}).`);
      return state;
    } catch (error) {
      await role.setPermissions(originalPermissions, 'Goliath Duplicator control rescue failure rollback').catch(() => null);
      console.warn(`[Duplicator] Could not elevate bot-only control role ${role.name} (${role.id}): ${error?.message || error}`);
    }
  }

  return null;
}

if (PermissionOverwriteManager?.prototype?.edit && !PermissionOverwriteManager.prototype[OVERWRITE_RESCUE_PATCH]) {
  const originalEdit = PermissionOverwriteManager.prototype.edit;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_RESCUE_PATCH, { value: true });

  PermissionOverwriteManager.prototype.edit = async function goliathBulkDeleteControlRescueEdit(target, options, reasonOrOptions) {
    const reason = typeof reasonOrOptions === 'string'
      ? reasonOrOptions
      : String(reasonOrOptions?.reason || '');
    if (!reason.startsWith('Goliath Duplicator bulk delete access repair by')) {
      return originalEdit.call(this, target, options, reasonOrOptions);
    }

    try {
      return await originalEdit.call(this, target, options, reasonOrOptions);
    } catch (error) {
      if (!isAccessError(error)) throw error;
      const guild = this.channel?.guild;
      const rescue = await acquireTemporaryControl(guild);
      if (!rescue) throw error;
      if (!rescue.preExisting) scheduleTemporaryControlRelease(guild.id);
      return originalEdit.call(this, target, options, reasonOrOptions);
    }
  };
}

if (GuildChannel?.prototype?.delete && !GuildChannel.prototype[DELETE_RESCUE_PATCH]) {
  const originalDelete = GuildChannel.prototype.delete;
  Object.defineProperty(GuildChannel.prototype, DELETE_RESCUE_PATCH, { value: true });

  GuildChannel.prototype.delete = async function goliathBulkDeleteControlRescue(reason) {
    if (!isBulkDeleteReason(reason)) return originalDelete.call(this, reason);

    try {
      return await originalDelete.call(this, reason);
    } catch (error) {
      if (!isAccessError(error)) throw error;
      const guild = this.guild;
      const rescue = await acquireTemporaryControl(guild);
      if (!rescue) {
        const wrapped = new Error(
          `Missing Access on ${this.name}. Administrator escalation is disabled. Goliath needs Manage Roles so Bulk Delete can temporarily apply only View Channel + Manage Channels + Manage Roles to its bot-only control role, or the target channel must already allow Manage Channels.`,
        );
        wrapped.code = Number(error?.code) || 50001;
        throw wrapped;
      }
      if (!rescue.preExisting) scheduleTemporaryControlRelease(guild.id);
      return originalDelete.call(this, reason);
    }
  };
}

function add(controlGuildId, manifest, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const destinationGuildId = String(manifest?.destinationGuildId || '');
  const rescue = destinationGuildId ? rescueByGuild.get(destinationGuildId) : null;
  const entry = {
    id: manifest.id || makeId(manifest.type === 'bulk-delete' ? 'DEL' : 'TR'),
    createdAt: manifest.createdAt || new Date().toISOString(),
    ...manifest,
    ...(manifest.type === 'bulk-delete' && rescue && !rescue.preExisting ? {
      temporaryControlRescue: {
        roleId: rescue.roleId,
        roleName: rescue.roleName,
        permissions: ['ViewChannel', 'ManageChannels', 'ManageRoles'],
        acquiredAt: new Date(rescue.acquiredAt).toISOString(),
      },
    } : {}),
  };
  saveHistory(controlGuildId, [entry, ...transferHistory.filter((item) => item?.id !== entry.id)], guildOrMeta);

  if (manifest.type === 'bulk-delete' && destinationGuildId && rescue && !rescue.preExisting) {
    queueMicrotask(() => { void releaseTemporaryControl(destinationGuildId); });
  }
  return entry;
}

function list(controlGuildId, limit = 25) {
  return readConfig(controlGuildId).transferHistory.slice(0, Math.max(1, Math.min(100, limit)));
}

function get(controlGuildId, id) {
  return readConfig(controlGuildId).transferHistory.find((item) => item?.id === id) || null;
}

function update(controlGuildId, id, patch, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const index = transferHistory.findIndex((item) => item?.id === id);
  if (index < 0) return null;
  const nextEntry = { ...transferHistory[index], ...(patch || {}), updatedAt: new Date().toISOString() };
  const next = [...transferHistory];
  next[index] = nextEntry;
  saveHistory(controlGuildId, next, guildOrMeta);
  return nextEntry;
}

function remove(controlGuildId, id, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const next = transferHistory.filter((item) => item?.id !== id);
  if (next.length === transferHistory.length) return false;
  saveHistory(controlGuildId, next, guildOrMeta);
  return true;
}

function clearWhere(controlGuildId, predicate, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const removed = [];
  const kept = [];
  for (const item of transferHistory) {
    if (predicate(item)) removed.push(item);
    else kept.push(item);
  }
  if (removed.length) saveHistory(controlGuildId, kept, guildOrMeta);
  return removed;
}

module.exports = { add, list, get, update, remove, clearWhere, makeId };
