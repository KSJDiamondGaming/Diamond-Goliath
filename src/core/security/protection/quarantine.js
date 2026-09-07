'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const { shouldBlockOwnerDestructiveAction } = require('../../../owner/dev/DevOverrideManager');
const { canManageTargetMember } = require('./core');
const schedulerRegistry = require('../../../owner/sentinel/schedulerRegistry');
const { emitGuildUpdate } = require('../../../server/sockets/socketHub');

const DEFAULT_QUARANTINE_ROLE_NAME = 'Goliath Quarantine';
const QUARANTINE_SWEEP_INTERVAL_MS = 60_000;
const QUARANTINE_SCHEDULER_ID = 'security:quarantine-expiry:global';
let quarantineSweepTimer = null;

function emptyQuarantineState() {
  return {
    enabled: true,
    roleId: null,
    roleName: DEFAULT_QUARANTINE_ROLE_NAME,
    isolationSyncedAt: null,
    users: {},
  };
}

function normalizeUsers(users) {
  return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
}

function getQuarantineState(guildId) {
  const security = guildManager.getSecurityConfig(guildId) || {};
  const raw = security.quarantine && typeof security.quarantine === 'object' && !Array.isArray(security.quarantine)
    ? security.quarantine
    : {};
  return {
    ...emptyQuarantineState(),
    ...raw,
    users: normalizeUsers(raw.users),
  };
}

function saveQuarantineState(guild, state) {
  const normalized = {
    ...emptyQuarantineState(),
    ...(state || {}),
    users: normalizeUsers(state?.users),
  };
  return guildManager.updateSecurityConfig(
    guild.id,
    (security) => ({ ...security, quarantine: normalized }),
    guild
  );
}

function emitCurrentQuarantineState(guild, action, extra = {}) {
  try {
    emitGuildUpdate(guild.id, {
      module: 'security',
      event: 'security.quarantine.updated',
      data: {
        action,
        quarantine: getQuarantineState(guild.id),
        ...extra,
      },
    });
  } catch (error) {
    console.warn('[QuarantineSystem] Failed to emit quarantine update:', error.message);
  }
}

function cleanRoleName(value) {
  const name = String(value || '').trim().slice(0, 100);
  return name || DEFAULT_QUARANTINE_ROLE_NAME;
}

function resolveConfiguredRoleName(guildId, options = {}) {
  const antiNuke = guildManager.getGuildSection(guildId, 'antiNuke', {}) || {};
  const state = getQuarantineState(guildId);
  return cleanRoleName(
    options.roleName
    || antiNuke?.quarantine?.roleName
    || state.roleName
    || DEFAULT_QUARANTINE_ROLE_NAME
  );
}

async function ensureQuarantineRole(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');
  const state = getQuarantineState(guild.id);
  const roleName = resolveConfiguredRoleName(guild.id, options);
  let role = state.roleId ? guild.roles.cache.get(String(state.roleId)) : null;
  if (!role) role = guild.roles.cache.find((entry) => entry.name === roleName) || null;

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: 0x991b1b,
      permissions: [],
      reason: 'Goliath quarantine containment role',
    });
  } else if (!role.managed && role.name !== roleName) {
    await role.setName(roleName, 'Synchronising Goliath quarantine role configuration').catch(() => null);
  }

  if (role.managed) throw new Error('Configured quarantine role is managed by an integration.');

  if (state.roleId !== role.id || state.roleName !== role.name) {
    saveQuarantineState(guild, { ...state, roleId: role.id, roleName: role.name });
  }
  return role;
}

function quarantineDenyOverwrite() {
  return {
    ViewChannel: false,
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
    UseApplicationCommands: false,
    Connect: false,
    Speak: false,
    Stream: false,
  };
}

async function syncQuarantineIsolation(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.', updated: 0, failed: 0 };
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { success: false, reason: 'Goliath is missing Manage Roles.', updated: 0, failed: 0 };
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { success: false, reason: 'Goliath is missing Manage Channels.', updated: 0, failed: 0 };
  }

  let role;
  try {
    role = options.role || await ensureQuarantineRole(guild, options);
  } catch (error) {
    return { success: false, reason: error.message, updated: 0, failed: 0 };
  }

  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  let updated = 0;
  let failed = 0;
  const failures = [];

  for (const [, channel] of channels || []) {
    if (!channel?.permissionOverwrites?.edit || channel.isThread?.()) continue;
    try {
      await channel.permissionOverwrites.edit(
        role.id,
        quarantineDenyOverwrite(),
        { reason: 'Goliath quarantine isolation policy' }
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      failures.push({ channelId: channel.id, channelName: channel.name || null, error: String(error?.message || error).slice(0, 250) });
    }
  }

  const state = getQuarantineState(guild.id);
  saveQuarantineState(guild, {
    ...state,
    roleId: role.id,
    roleName: role.name,
    isolationSyncedAt: Date.now(),
  });

  if (failed) {
    console.warn(`[QuarantineSystem] Isolation sync incomplete in ${guild.id}: ${failed} channel(s) failed.`);
  }
  return { success: failed === 0, roleId: role.id, roleName: role.name, updated, failed, failures };
}

function createQuarantineDryRunResult(guild, member, options = {}) {
  const snapshotRoles = member.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => role.id);

  emitCurrentQuarantineState(guild, 'member_quarantine_dry_run', {
    memberId: member.id,
    testMode: true,
    dryRun: true,
  });

  console.log(`[TEST MODE] Quarantine prevented for owner ${member.user?.tag || member.id} in guild ${guild.id}`);
  return {
    success: true,
    testMode: true,
    dryRun: true,
    action: 'quarantine',
    executed: false,
    roleId: null,
    snapshotRoles,
    memberId: member.id,
    memberTag: member.user?.tag || null,
    reason: options.reason || 'Development test override prevented owner quarantine.',
  };
}

async function quarantineMember(guild, member, options = {}) {
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };

  if (shouldBlockOwnerDestructiveAction({ guild, member, action: 'quarantine' })) {
    return createQuarantineDryRunResult(guild, member, options);
  }

  const manageCheck = canManageTargetMember(guild, member);
  if (!manageCheck.allowed) return { success: false, reason: manageCheck.reason || 'Target cannot be managed by Goliath.' };

  const existing = getQuarantineState(guild.id).users?.[member.id];
  if (existing) return { success: false, alreadyQuarantined: true, reason: 'Member is already quarantined.' };

  try {
    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role });
    if (!isolation.success) {
      return {
        success: false,
        reason: `Quarantine isolation could not be guaranteed: ${isolation.reason || `${isolation.failed} channel(s) failed`}`,
        isolation,
      };
    }

    const snapshotRoles = member.roles.cache
      .filter((entry) => entry.id !== guild.id && entry.id !== role.id)
      .map((entry) => entry.id);

    await member.roles.set([role.id], options.reason || 'Goliath quarantine applied.');
    const state = getQuarantineState(guild.id);
    state.roleId = role.id;
    state.roleName = role.name;
    state.users[member.id] = {
      memberId: member.id,
      memberTag: member.user?.tag || null,
      quarantinedAt: Date.now(),
      reason: options.reason || 'No reason provided',
      roles: snapshotRoles,
      quarantinedBy: options.quarantinedBy || null,
      source: options.source || (options.quarantinedBy === 'anti_nuke' ? 'anti_nuke' : 'moderation'),
      expiresAt: options.durationMs && Number(options.durationMs) > 0 ? Date.now() + Number(options.durationMs) : null,
    };
    saveQuarantineState(guild, state);
    emitCurrentQuarantineState(guild, 'member_quarantined', { memberId: member.id });
    return { success: true, roleId: role.id, snapshotRoles, isolation };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getRestorableRoleIds(guild, snapshotRoleIds = [], quarantineRoleId = null) {
  await guild.roles.fetch().catch(() => null);
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  const botHighest = Number(botMember?.roles?.highest?.position || 0);
  const restored = [];
  const skipped = [];

  for (const roleId of [...new Set((snapshotRoleIds || []).map(String))]) {
    const role = guild.roles.cache.get(roleId);
    if (!role) { skipped.push({ roleId, reason: 'role_missing' }); continue; }
    if (role.id === guild.id || role.id === quarantineRoleId) continue;
    if (role.managed) { skipped.push({ roleId, roleName: role.name, reason: 'managed_role' }); continue; }
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      skipped.push({ roleId, roleName: role.name, reason: 'missing_manage_roles' });
      continue;
    }
    if (Number(role.position || 0) >= botHighest) {
      skipped.push({ roleId, roleName: role.name, reason: 'role_hierarchy' });
      continue;
    }
    restored.push(role.id);
  }
  return { restored, skipped };
}

async function restoreQuarantinedMember(guild, member, options = {}) {
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };
  const state = getQuarantineState(guild.id);
  const snapshot = state.users?.[member.id];
  if (!snapshot) return { success: false, reason: 'No quarantine snapshot' };

  try {
    const quarantineRoleId = state.roleId || null;
    const roles = await getRestorableRoleIds(guild, snapshot.roles, quarantineRoleId);
    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');
    delete state.users[member.id];
    saveQuarantineState(guild, state);
    emitCurrentQuarantineState(guild, 'member_restored', {
      memberId: member.id,
      restoredRoles: roles.restored.length,
      skippedRoles: roles.skipped,
    });
    return { success: true, restoredRoles: roles.restored.length, restoredRoleIds: roles.restored, skippedRoles: roles.skipped };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function clearExpiredAbsentMember(guild, userId, state) {
  delete state.users[userId];
  saveQuarantineState(guild, state);
  emitCurrentQuarantineState(guild, 'member_quarantine_expired_absent', { memberId: userId });
}

async function restoreExpiredQuarantines(client) {
  if (!client) return { checked: 0, restored: 0, clearedAbsent: 0, failed: 0 };
  const result = { checked: 0, restored: 0, clearedAbsent: 0, failed: 0 };
  for (const [, guild] of client.guilds.cache) {
    try {
      let state = getQuarantineState(guild.id);
      for (const userId of Object.keys(state.users || {})) {
        const snapshot = state.users[userId];
        if (!snapshot?.expiresAt || Date.now() < Number(snapshot.expiresAt)) continue;
        result.checked += 1;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await clearExpiredAbsentMember(guild, userId, state);
          result.clearedAbsent += 1;
          state = getQuarantineState(guild.id);
          continue;
        }
        console.log(`[QuarantineSystem] Auto restoring ${member.user.tag}`);
        const restored = await restoreQuarantinedMember(guild, member, { reason: 'Automatic quarantine expiry' });
        if (restored.success) result.restored += 1;
        else result.failed += 1;
        state = getQuarantineState(guild.id);
      }
    } catch (error) {
      result.failed += 1;
      console.warn(`[QuarantineSystem] Failed restore cycle for guild ${guild.id}:`, error.message);
    }
  }
  return result;
}

async function enforceQuarantineOnMember(member, options = {}) {
  const guild = member?.guild;
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };
  const state = getQuarantineState(guild.id);
  const snapshot = state.users?.[member.id];
  if (!snapshot) return { success: false, notQuarantined: true, reason: 'No quarantine snapshot' };

  if (snapshot.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
    delete state.users[member.id];
    saveQuarantineState(guild, state);
    emitCurrentQuarantineState(guild, 'member_quarantine_expired_on_join', { memberId: member.id });
    return { success: true, expired: true, executed: false };
  }

  try {
    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role });
    if (!isolation.success) return { success: false, reason: 'Quarantine isolation sync failed.', isolation };
    await member.roles.set([role.id], 'Reapplying active Goliath quarantine');
    emitCurrentQuarantineState(guild, 'member_quarantine_reapplied', { memberId: member.id });
    return { success: true, roleId: role.id, isolation };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function recoverGuildQuarantine(guild) {
  if (!guild) return { success: false, reason: 'Missing guild.', active: 0, reapplied: 0, restored: 0, failed: 0 };
  const state = getQuarantineState(guild.id);
  const entries = Object.entries(state.users || {});
  if (!entries.length) return { success: true, active: 0, reapplied: 0, restored: 0, failed: 0 };

  const role = await ensureQuarantineRole(guild).catch((error) => {
    console.warn(`[QuarantineSystem] Failed to recover role in guild ${guild.id}:`, error.message);
    return null;
  });
  if (!role) return { success: false, reason: 'Quarantine role recovery failed.', active: entries.length, reapplied: 0, restored: 0, failed: entries.length };

  const isolation = await syncQuarantineIsolation(guild, { role });
  let reapplied = 0;
  let restored = 0;
  let failed = isolation.success ? 0 : 1;

  for (const [userId, snapshot] of entries) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (snapshot?.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
      if (member) {
        const result = await restoreQuarantinedMember(guild, member, { reason: 'Automatic quarantine expiry during startup recovery' });
        if (result.success) restored += 1;
        else failed += 1;
      } else {
        const latest = getQuarantineState(guild.id);
        await clearExpiredAbsentMember(guild, userId, latest);
        restored += 1;
      }
      continue;
    }
    if (!member) continue;
    const result = await enforceQuarantineOnMember(member, { role });
    if (result.success) reapplied += 1;
    else failed += 1;
  }

  return { success: failed === 0, active: entries.length, reapplied, restored, failed, isolation };
}

async function recoverQuarantines(client) {
  if (!client) return { guilds: 0, active: 0, reapplied: 0, restored: 0, failed: 0 };
  const result = { guilds: 0, active: 0, reapplied: 0, restored: 0, failed: 0 };
  for (const [, guild] of client.guilds.cache) {
    const state = getQuarantineState(guild.id);
    if (!Object.keys(state.users || {}).length) continue;
    result.guilds += 1;
    try {
      const recovered = await recoverGuildQuarantine(guild);
      result.active += Number(recovered.active || 0);
      result.reapplied += Number(recovered.reapplied || 0);
      result.restored += Number(recovered.restored || 0);
      result.failed += Number(recovered.failed || 0);
    } catch (error) {
      result.failed += 1;
      console.warn(`[QuarantineSystem] Failed startup recovery for guild ${guild.id}:`, error.message);
    }
  }
  return result;
}

function startQuarantineExpiryScheduler(client) {
  if (!client) return null;
  if (quarantineSweepTimer) return quarantineSweepTimer;

  schedulerRegistry.register({
    id: QUARANTINE_SCHEDULER_ID,
    module: 'security',
    component: 'quarantine-expiry',
    intervalMs: QUARANTINE_SWEEP_INTERVAL_MS,
    staleAfterMs: QUARANTINE_SWEEP_INTERVAL_MS * 3,
  });

  const run = async (phase = 'scheduled') => {
    try {
      const result = await restoreExpiredQuarantines(client);
      schedulerRegistry.beat(QUARANTINE_SCHEDULER_ID, { phase, ...result });
    } catch (error) {
      schedulerRegistry.fail(QUARANTINE_SCHEDULER_ID, error, { phase });
      console.warn('[QuarantineSystem] Expiry scheduler failed:', error.message);
    }
  };

  run('startup');
  quarantineSweepTimer = setInterval(() => run('scheduled'), QUARANTINE_SWEEP_INTERVAL_MS);
  quarantineSweepTimer.unref?.();
  return quarantineSweepTimer;
}

function stopQuarantineExpiryScheduler() {
  if (quarantineSweepTimer) clearInterval(quarantineSweepTimer);
  quarantineSweepTimer = null;
  schedulerRegistry.stop(QUARANTINE_SCHEDULER_ID, 'quarantine expiry scheduler stopped');
}

module.exports = {
  DEFAULT_QUARANTINE_ROLE_NAME,
  QUARANTINE_SWEEP_INTERVAL_MS,
  emptyQuarantineState,
  getQuarantineState,
  saveQuarantineState,
  ensureQuarantineRole,
  syncQuarantineIsolation,
  quarantineMember,
  restoreQuarantinedMember,
  restoreExpiredQuarantines,
  enforceQuarantineOnMember,
  recoverGuildQuarantine,
  recoverQuarantines,
  startQuarantineExpiryScheduler,
  stopQuarantineExpiryScheduler,
};
