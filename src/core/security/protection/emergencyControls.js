'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const schedulerRegistry = require('../../../owner/sentinel/schedulerRegistry');

const RECOVERY_INTERVAL_MS = 60_000;
const RECOVERY_SCHEDULER_ID = 'security:emergency-controls-recovery:global';
let recoveryTimer = null;

function emptyState() {
  return {
    invites: { active: false, enabledAt: null, expiresAt: null, reason: null, channelSnapshots: [] },
    roles: { active: false, enabledAt: null, expiresAt: null, reason: null, roleSnapshots: [] },
  };
}

function getEmergencyControlState(guildId) {
  const security = guildManager.getSecurityConfig(guildId) || {};
  const raw = security.emergencyControls && typeof security.emergencyControls === 'object'
    ? security.emergencyControls
    : {};
  const base = emptyState();
  return {
    invites: { ...base.invites, ...(raw.invites || {}), channelSnapshots: Array.isArray(raw.invites?.channelSnapshots) ? raw.invites.channelSnapshots : [] },
    roles: { ...base.roles, ...(raw.roles || {}), roleSnapshots: Array.isArray(raw.roles?.roleSnapshots) ? raw.roles.roleSnapshots : [] },
  };
}

function saveState(guild, next) {
  return guildManager.updateSecurityConfig(guild.id, (security = {}) => ({
    ...security,
    emergencyControls: next,
  }), guild);
}

function normalizeDuration(value, fallback = 60 * 60 * 1000) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0
    ? Math.max(60_000, Math.min(7 * 24 * 60 * 60 * 1000, Math.trunc(duration)))
    : fallback;
}

function serializeChannelOverwrites(channel) {
  try {
    return channel.permissionOverwrites.cache.map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString(),
    }));
  } catch {
    return [];
  }
}

async function restoreChannelOverwrites(channel, snapshot, reason) {
  const payload = (snapshot?.overwrites || []).map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: BigInt(overwrite.allow || 0),
    deny: BigInt(overwrite.deny || 0),
  }));
  await channel.permissionOverwrites.set(payload, reason);
}

function inviteCapableRoleIds(guild, trustedRoleIds = []) {
  const trusted = new Set((trustedRoleIds || []).map(String));
  return [...guild.roles.cache.values()]
    .filter((role) => !role.managed && role.id !== guild.id && !trusted.has(String(role.id)))
    .filter((role) => role.permissions.has(PermissionFlagsBits.CreateInstantInvite) || role.permissions.has(PermissionFlagsBits.Administrator))
    .map((role) => role.id);
}

async function disableInvites(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.' };
  const current = getEmergencyControlState(guild.id);
  if (current.invites.active) return { success: true, alreadyActive: true, expiresAt: current.invites.expiresAt, changedChannels: current.invites.channelSnapshots.length };
  const bot = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!bot?.permissions?.has(PermissionFlagsBits.ManageChannels)) return { success: false, reason: 'Goliath is missing Manage Channels.' };

  const durationMs = normalizeDuration(options.durationMs);
  const roleIds = inviteCapableRoleIds(guild, options.trustedRoleIds);
  const snapshots = [];
  const failures = [];
  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return { success: false, reason: 'Failed to fetch guild channels.' };

  for (const [, channel] of channels) {
    if (!channel?.permissionOverwrites?.edit || !channel.manageable) continue;
    const snapshot = { channelId: channel.id, overwrites: serializeChannelOverwrites(channel) };
    try {
      await channel.permissionOverwrites.edit(guild.id, { CreateInstantInvite: false }, { reason: options.reason || 'Goliath emergency invite freeze' });
      for (const roleId of roleIds) {
        await channel.permissionOverwrites.edit(roleId, { CreateInstantInvite: false }, { reason: options.reason || 'Goliath emergency invite freeze' });
      }
      snapshots.push(snapshot);
    } catch (error) {
      failures.push({ channelId: channel.id, error: String(error?.message || error).slice(0, 250) });
      await restoreChannelOverwrites(channel, snapshot, 'Rolling back incomplete Goliath invite freeze').catch(() => null);
    }
  }

  if (failures.length) {
    for (const saved of snapshots) {
      const channel = guild.channels.cache.get(saved.channelId) || await guild.channels.fetch(saved.channelId).catch(() => null);
      if (channel) await restoreChannelOverwrites(channel, saved, 'Rolling back incomplete Goliath invite freeze').catch(() => null);
    }
    return { success: false, reason: 'Invite freeze could not be applied atomically.', failures };
  }

  const enabledAt = Date.now();
  const next = getEmergencyControlState(guild.id);
  next.invites = {
    active: true,
    enabledAt,
    expiresAt: enabledAt + durationMs,
    reason: options.reason || 'Emergency invite freeze',
    channelSnapshots: snapshots,
  };
  saveState(guild, next);
  return { success: true, changedChannels: snapshots.length, expiresAt: next.invites.expiresAt };
}

async function restoreInvites(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.' };
  const state = getEmergencyControlState(guild.id);
  if (!state.invites.active) return { success: true, alreadyInactive: true, restoredChannels: 0 };
  const failures = [];
  let restoredChannels = 0;
  for (const saved of state.invites.channelSnapshots) {
    const channel = guild.channels.cache.get(saved.channelId) || await guild.channels.fetch(saved.channelId).catch(() => null);
    if (!channel) continue;
    try {
      await restoreChannelOverwrites(channel, saved, options.reason || 'Restoring emergency invite freeze');
      restoredChannels += 1;
    } catch (error) {
      failures.push({ channelId: saved.channelId, error: String(error?.message || error).slice(0, 250) });
    }
  }
  if (failures.length) return { success: false, restoredChannels, failures };
  const next = getEmergencyControlState(guild.id);
  next.invites = emptyState().invites;
  saveState(guild, next);
  return { success: true, restoredChannels };
}

function rolesToFreeze(guild, trustedRoleIds = []) {
  const trusted = new Set((trustedRoleIds || []).map(String));
  const bot = guild.members?.me;
  return [...guild.roles.cache.values()]
    .filter((role) => !role.managed && role.id !== guild.id && !trusted.has(String(role.id)))
    .filter((role) => role.permissions.has(PermissionFlagsBits.ManageRoles) || role.permissions.has(PermissionFlagsBits.Administrator))
    .filter((role) => role.editable && (!bot?.roles?.highest || role.position < bot.roles.highest.position));
}

async function freezeRoles(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.' };
  const current = getEmergencyControlState(guild.id);
  if (current.roles.active) return { success: true, alreadyActive: true, expiresAt: current.roles.expiresAt, changedRoles: current.roles.roleSnapshots.length };
  const bot = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!bot?.permissions?.has(PermissionFlagsBits.ManageRoles)) return { success: false, reason: 'Goliath is missing Manage Roles.' };

  const durationMs = normalizeDuration(options.durationMs);
  const candidates = rolesToFreeze(guild, options.trustedRoleIds);
  const snapshots = [];
  const failures = [];
  for (const role of candidates) {
    const original = role.permissions.bitfield;
    const hardened = original & ~PermissionFlagsBits.ManageRoles & ~PermissionFlagsBits.Administrator;
    try {
      await role.setPermissions(hardened, options.reason || 'Goliath emergency role freeze');
      snapshots.push({ roleId: role.id, permissions: original.toString() });
    } catch (error) {
      failures.push({ roleId: role.id, error: String(error?.message || error).slice(0, 250) });
    }
  }

  if (failures.length) {
    for (const saved of snapshots) {
      const role = guild.roles.cache.get(saved.roleId);
      if (role?.editable) await role.setPermissions(BigInt(saved.permissions), 'Rolling back incomplete Goliath role freeze').catch(() => null);
    }
    return { success: false, reason: 'Role freeze could not be applied atomically.', failures };
  }

  const enabledAt = Date.now();
  const next = getEmergencyControlState(guild.id);
  next.roles = {
    active: true,
    enabledAt,
    expiresAt: enabledAt + durationMs,
    reason: options.reason || 'Emergency role freeze',
    roleSnapshots: snapshots,
  };
  saveState(guild, next);
  return { success: true, changedRoles: snapshots.length, expiresAt: next.roles.expiresAt };
}

async function restoreRoles(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.' };
  const state = getEmergencyControlState(guild.id);
  if (!state.roles.active) return { success: true, alreadyInactive: true, restoredRoles: 0 };
  const failures = [];
  let restoredRoles = 0;
  for (const saved of state.roles.roleSnapshots) {
    const role = guild.roles.cache.get(saved.roleId) || await guild.roles.fetch(saved.roleId).catch(() => null);
    if (!role || !role.editable) {
      failures.push({ roleId: saved.roleId, error: 'Role missing or no longer editable.' });
      continue;
    }
    try {
      await role.setPermissions(BigInt(saved.permissions), options.reason || 'Restoring emergency role freeze');
      restoredRoles += 1;
    } catch (error) {
      failures.push({ roleId: saved.roleId, error: String(error?.message || error).slice(0, 250) });
    }
  }
  if (failures.length) return { success: false, restoredRoles, failures };
  const next = getEmergencyControlState(guild.id);
  next.roles = emptyState().roles;
  saveState(guild, next);
  return { success: true, restoredRoles };
}

async function recoverEmergencyControls(client) {
  const result = { guilds: 0, invitesRestored: 0, rolesRestored: 0, failed: 0 };
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    result.guilds += 1;
    const state = getEmergencyControlState(guild.id);
    if (state.invites.active && state.invites.expiresAt && Date.now() >= Number(state.invites.expiresAt)) {
      const restored = await restoreInvites(guild, { reason: 'Automatic emergency invite freeze expiry' });
      if (restored.success) result.invitesRestored += 1; else result.failed += 1;
    }
    if (state.roles.active && state.roles.expiresAt && Date.now() >= Number(state.roles.expiresAt)) {
      const restored = await restoreRoles(guild, { reason: 'Automatic emergency role freeze expiry' });
      if (restored.success) result.rolesRestored += 1; else result.failed += 1;
    }
  }
  return result;
}

function startEmergencyControlRecoveryScheduler(client) {
  if (!client) return null;
  if (recoveryTimer) return recoveryTimer;
  schedulerRegistry.register({ id: RECOVERY_SCHEDULER_ID, module: 'security', component: 'emergency-controls-recovery', intervalMs: RECOVERY_INTERVAL_MS, staleAfterMs: RECOVERY_INTERVAL_MS * 3 });
  recoveryTimer = setInterval(async () => {
    try {
      const result = await recoverEmergencyControls(client);
      schedulerRegistry.beat(RECOVERY_SCHEDULER_ID, result);
    } catch (error) {
      schedulerRegistry.fail(RECOVERY_SCHEDULER_ID, error);
    }
  }, RECOVERY_INTERVAL_MS);
  recoveryTimer.unref?.();
  return recoveryTimer;
}

module.exports = {
  RECOVERY_INTERVAL_MS,
  getEmergencyControlState,
  disableInvites,
  restoreInvites,
  freezeRoles,
  restoreRoles,
  recoverEmergencyControls,
  startEmergencyControlRecoveryScheduler,
};