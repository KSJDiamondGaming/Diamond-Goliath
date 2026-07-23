'use strict';

const socialStore = require('./socialStore');
const socialHistory = require('./socialHistory');

const deliveryLocks = new Map();

function lockKey(guildId, account = {}, result = {}) {
  return [String(guildId), account.accountId || account.id || 'account', result.alertType || 'live', result.contentId || 'content'].join(':');
}

async function withDeliveryLock(guildId, account, result, operation) {
  const key = lockKey(guildId, account, result);
  const previous = deliveryLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  deliveryLocks.set(key, previous.then(() => current));

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (deliveryLocks.get(key) === current) deliveryLocks.delete(key);
    else setImmediate(() => {
      const pending = deliveryLocks.get(key);
      if (pending === current) deliveryLocks.delete(key);
    });
  }
}

function freshAccount(guildId, account = {}) {
  const accountId = account.accountId || account.id;
  if (!accountId) return account;
  return socialStore.getSocialSection(guildId).accounts?.[socialStore.cleanKey(accountId, 'account')] || account;
}

function suppressionBase(account = {}, result = {}) {
  return {
    accountId: account.accountId || account.id || null,
    creator: account.displayName || account.username || null,
    platform: account.platform || result.platform || null,
    alertType: result.alertType || 'live',
    contentId: result.contentId || null,
    title: result.title || null,
  };
}

function evaluate(guildId, account = {}, result = {}, meta = {}) {
  const current = freshAccount(guildId, account);
  const settings = socialStore.getSocialSection(guildId).settings || {};
  const lastSeen = current.lastSeen || {};

  if (settings.suppressDuplicates !== false && meta.forceDuplicate !== true && result.contentId && lastSeen.lastContentId === result.contentId) {
    socialHistory.record(guildId, {
      ...suppressionBase(current, result),
      status: 'suppressed',
      eventType: 'duplicate',
      reason: 'duplicate_content',
    }, meta);
    return { allowed: false, account: current, reason: 'duplicate_content' };
  }

  const cooldownMs = Math.max(0, Number(settings.cooldownMs || 0));
  const lastAlertAt = Date.parse(lastSeen.lastAlertAt || '');
  if (cooldownMs > 0 && meta.bypassCooldown !== true && Number.isFinite(lastAlertAt)) {
    const remainingMs = cooldownMs - (Date.now() - lastAlertAt);
    if (remainingMs > 0) {
      socialHistory.record(guildId, {
        ...suppressionBase(current, result),
        status: 'suppressed',
        eventType: 'cooldown',
        reason: 'cooldown_active',
        metadata: { cooldownMs, remainingMs },
      }, meta);
      return { allowed: false, account: current, reason: 'cooldown_active', remainingMs };
    }
  }

  return { allowed: true, account: current };
}

async function run(guildId, account, result, meta, operation) {
  return withDeliveryLock(guildId, account, result, async () => {
    const decision = evaluate(guildId, account, result, meta);
    if (!decision.allowed) {
      return { success: false, skipped: true, reason: decision.reason, remainingMs: decision.remainingMs };
    }
    return operation(decision.account);
  });
}

function summary() {
  return { activeLocks: deliveryLocks.size };
}

module.exports = { lockKey, withDeliveryLock, freshAccount, evaluate, run, summary };
