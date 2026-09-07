'use strict';

const {
  GuildChannel,
  PermissionFlagsBits,
  PermissionOverwriteManager,
} = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');

const MAX_HISTORY = 100;
const OVERWRITE_RESCUE_PATCH = Symbol.for('goliath.duplicator.bulk-delete-overwrite-admin-rescue');
const DELETE_RESCUE_PATCH = Symbol.for('goliath.duplicator.bulk-delete-delete-admin-rescue');
const rescueByGuild = new Map();

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

function rescueRoleScore(role) {
  const name = String(role?.name || '').toLowerCase();
  let score = 0;
  if (/^operations?$/.test(name)) score += 100;
  if (/^admins?$|administrator/.test(name)) score += 80;
  if (/owner|staff/.test(name)) score += 30;
  if ((role?.members?.size || 0) === 0) score += 15;
  score += Math.min(10, Number(role?.position || 0) / 1000);
  return score;
}

async function releaseTemporaryAdmin(guildId) {
  const key = String(guildId || '');
  const state = rescueByGuild.get(key);
  if (!state) return false;
  rescueByGuild.delete(key);
  if (state.timer) clearTimeout(state.timer);
  if (state.preExisting || !state.roleId) return true;

  const guild = state.guild;
  if (!guild) return false;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me || !me.roles.cache.has(state.roleId)) return true;

  try {
    await me.roles.remove(state.roleId, `Goliath Duplicator bulk-delete rescue cleanup (${state.roleName})`);
  } catch (error) {
    console.error('[Duplicator] Failed to remove temporary bulk-delete Administrator role:', error);
    return false;
  }
  return true;
}

function scheduleTemporaryAdminRelease(guildId, delayMs = 90_000) {
  const state = rescueByGuild.get(String(guildId || ''));
  if (!state || state.preExisting) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    void releaseTemporaryAdmin(guildId);
  }, delayMs);
  if (typeof state.timer.unref === 'function') state.timer.unref();
}

async function acquireTemporaryAdmin(guild) {
  if (!guild) return null;
  const guildId = String(guild.id);
  const existing = rescueByGuild.get(guildId);
  if (existing) {
    if (!existing.preExisting) scheduleTemporaryAdminRelease(guildId);
    return existing;
  }

  await guild.roles.fetch().catch(() => null);
  await guild.members.fetchMe().catch(() => null);
  const me = guild.members.me;
  if (!me) return null;

  if (me.permissions.has(PermissionFlagsBits.Administrator)) {
    const state = {
      guild,
      roleId: null,
      roleName: 'existing Administrator',
      acquiredAt: Date.now(),
      preExisting: true,
      timer: null,
    };
    rescueByGuild.set(guildId, state);
    return state;
  }

  // Discord does not allow a bot to create authority it does not already control. For
  // legacy copied channels, borrow an existing Administrator role only when that role is
  // already below Goliath's highest role and Goliath has Manage Roles at guild level.
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return null;

  const highest = Number(me.roles.highest?.position || 0);
  const candidates = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .filter((role) => !role.managed)
    .filter((role) => Number(role.position || 0) < highest)
    .filter((role) => role.permissions?.has(PermissionFlagsBits.Administrator))
    .sort((a, b) => rescueRoleScore(b) - rescueRoleScore(a));

  for (const role of candidates) {
    try {
      await me.roles.add(role.id, `Goliath Duplicator temporary bulk-delete Administrator rescue (${guildId})`);
      await guild.members.fetchMe().catch(() => null);
      const refreshed = guild.members.me;
      if (!refreshed?.permissions?.has(PermissionFlagsBits.Administrator)) {
        await me.roles.remove(role.id, 'Goliath Duplicator rescue verification rollback').catch(() => null);
        continue;
      }

      const state = {
        guild,
        roleId: role.id,
        roleName: role.name,
        acquiredAt: Date.now(),
        preExisting: false,
        timer: null,
      };
      rescueByGuild.set(guildId, state);
      scheduleTemporaryAdminRelease(guildId);
      console.warn(`[Duplicator] Temporary Administrator rescue enabled with ${role.name} (${role.id}) in ${guild.name} (${guild.id}).`);
      return state;
    } catch (error) {
      console.warn(`[Duplicator] Could not attach rescue role ${role.name} (${role.id}): ${error?.message || error}`);
    }
  }

  return null;
}

// recoverBulkDeleteAccess() edits Goliath's own overwrite before a batch is allowed to
// start. Old exact copies can deny the bot enough access that this edit itself receives
// 50001/50013. In that case temporarily borrow a manageable existing Administrator role,
// retry the same edit, and leave cleanup to the bulk-delete manifest/fail-safe timer.
if (PermissionOverwriteManager?.prototype?.edit && !PermissionOverwriteManager.prototype[OVERWRITE_RESCUE_PATCH]) {
  const originalEdit = PermissionOverwriteManager.prototype.edit;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_RESCUE_PATCH, { value: true });

  PermissionOverwriteManager.prototype.edit = async function goliathBulkDeleteRescueEdit(target, options, reasonOrOptions) {
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
      const rescue = await acquireTemporaryAdmin(guild);
      if (!rescue) throw error;
      if (!rescue.preExisting) scheduleTemporaryAdminRelease(guild.id);
      return originalEdit.call(this, target, options, reasonOrOptions);
    }
  };
}

// Also guard the final Discord DELETE request. discord.js permission calculations can say
// Manage Channels is effective while Discord still returns Missing Access for a legacy
// channel. This catches the authoritative API failure and retries once under the same
// temporary Administrator rescue.
if (GuildChannel?.prototype?.delete && !GuildChannel.prototype[DELETE_RESCUE_PATCH]) {
  const originalDelete = GuildChannel.prototype.delete;
  Object.defineProperty(GuildChannel.prototype, DELETE_RESCUE_PATCH, { value: true });

  GuildChannel.prototype.delete = async function goliathBulkDeleteAdminRescue(reason) {
    if (!isBulkDeleteReason(reason)) return originalDelete.call(this, reason);

    try {
      return await originalDelete.call(this, reason);
    } catch (error) {
      if (!isAccessError(error)) throw error;
      const guild = this.guild;
      const rescue = await acquireTemporaryAdmin(guild);
      if (!rescue) {
        const wrapped = new Error(
          `Missing Access on ${this.name}. Automatic rescue could not find an existing Administrator role below Goliath's highest role that Goliath is allowed to assign.`,
        );
        wrapped.code = Number(error?.code) || 50001;
        throw wrapped;
      }
      if (!rescue.preExisting) scheduleTemporaryAdminRelease(guild.id);
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
      temporaryAdminRescue: {
        roleId: rescue.roleId,
        roleName: rescue.roleName,
        acquiredAt: new Date(rescue.acquiredAt).toISOString(),
      },
    } : {}),
  };
  saveHistory(controlGuildId, [entry, ...transferHistory.filter((item) => item?.id !== entry.id)], guildOrMeta);

  // The rescue exists only to complete this explicitly-confirmed delete. Remove it as soon
  // as the result is recorded. The 90-second timer above remains a second cleanup path if
  // an exception prevents a manifest from being written.
  if (manifest.type === 'bulk-delete' && destinationGuildId && rescue && !rescue.preExisting) {
    queueMicrotask(() => { void releaseTemporaryAdmin(destinationGuildId); });
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

module.exports = {
  add,
  list,
  get,
  update,
  remove,
  clearWhere,
  makeId,
  acquireTemporaryAdmin,
  releaseTemporaryAdmin,
  scheduleTemporaryAdminRelease,
};
