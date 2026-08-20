'use strict';

// Process-local keyed queue for Role Selector mutations. Goliath currently runs
// one PM2 process per environment, so this is the correct coordination boundary.
// Keys are deliberately scoped by guild and concern so callers can serialize
// conflicting work without blocking unrelated guilds.
const tails = new Map();

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

function withRoleSelectorLock(guildId, scope, task, identity = '') {
  return withKeyedLock(lockKey(guildId, scope, identity), task);
}

function withGuildLock(guildId, task) {
  return withRoleSelectorLock(guildId, 'guild', task);
}

function withMemberGroupLock(guildId, memberId, groupId, task) {
  return withRoleSelectorLock(guildId, 'member-group', task, `${cleanPart(memberId)}:${cleanPart(groupId)}`);
}

function withManagedRoleLock(guildId, identity, task) {
  return withRoleSelectorLock(guildId, 'managed-role', task, identity);
}

function withDeploymentLock(guildId, task) {
  return withRoleSelectorLock(guildId, 'deployment', task);
}

function pendingLockCount() {
  return tails.size;
}

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
