'use strict';

const crypto = require('crypto');

const DEFAULT_BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF_MULTIPLIER = 16;
const DEFAULT_STARTUP_WARMUP_MS = 120000;
const MIN_STARTUP_WARMUP_MS = 0;
const MAX_STARTUP_WARMUP_MS = 900000;

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function backoffMultiplier(value = process.env.SOCIAL_PROVIDER_BACKOFF_MULTIPLIER) {
  return boundedNumber(value, DEFAULT_BACKOFF_MULTIPLIER, 1, 4);
}

function maxBackoffMultiplier(value = process.env.SOCIAL_PROVIDER_MAX_BACKOFF_MULTIPLIER) {
  return boundedNumber(value, MAX_BACKOFF_MULTIPLIER, 1, 64);
}

function startupWarmupMs(value = process.env.SOCIAL_PROVIDER_STARTUP_WARMUP_MS) {
  return boundedNumber(value, DEFAULT_STARTUP_WARMUP_MS, MIN_STARTUP_WARMUP_MS, MAX_STARTUP_WARMUP_MS);
}

function stableOffsetMs(key, windowMs) {
  const safeWindow = Math.max(0, Number(windowMs) || 0);
  if (!safeWindow) return 0;
  const digest = crypto.createHash('sha256').update(String(key || 'social')).digest();
  return digest.readUInt32BE(0) % (safeWindow + 1);
}

function healthMultiplier(health = {}) {
  if (health.state === 'open') return Infinity;
  if (health.state === 'half_open') return 1;
  const failures = Math.max(0, Number(health.consecutiveFailures || 0));
  if (!failures) return 1;
  return Math.min(
    maxBackoffMultiplier(),
    backoffMultiplier() ** failures,
  );
}

function effectiveIntervalMs(baseIntervalMs, health = {}) {
  const base = Math.max(0, Number(baseIntervalMs) || 0);
  const multiplier = healthMultiplier(health);
  return Number.isFinite(multiplier) ? Math.round(base * multiplier) : Infinity;
}

function lastCheckedAt(account = {}) {
  const value = Date.parse(account.lastSeen?.lastCheckedAt || account.metadata?.provider?.lastCheckedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function nextDueAt(account = {}, baseIntervalMs, health = {}, options = {}) {
  const now = Number(options.now ?? Date.now());
  if (health.state === 'open') {
    const openUntil = Date.parse(health.openUntil || '');
    return Number.isFinite(openUntil) ? openUntil : now + Math.max(0, Number(baseIntervalMs) || 0);
  }
  if (health.state === 'half_open') return now;

  const checkedAt = lastCheckedAt(account);
  if (checkedAt) return checkedAt + effectiveIntervalMs(baseIntervalMs, health);

  const startupAt = Number(options.startupAt || 0);
  const warmupMs = startupWarmupMs(options.startupWarmupMs);
  if (startupAt && warmupMs > 0) {
    const key = `${account.platform || 'unknown'}:${account.accountId || account.id || account.username || 'account'}`;
    return startupAt + stableOffsetMs(key, warmupMs);
  }
  return now;
}

function decision(account = {}, baseIntervalMs, health = {}, options = {}) {
  const now = Number(options.now ?? Date.now());
  if (options.force === true) {
    return { due: true, reason: 'forced', nextDueAt: now, intervalMs: effectiveIntervalMs(baseIntervalMs, health) };
  }

  const dueAt = nextDueAt(account, baseIntervalMs, health, options);
  const due = dueAt <= now;
  return {
    due,
    reason: due
      ? (health.state === 'half_open' ? 'recovery_probe_due' : 'poll_due')
      : (health.state === 'open' ? 'provider_circuit_open' : lastCheckedAt(account) ? 'adaptive_backoff' : 'startup_warmup'),
    nextDueAt: dueAt,
    remainingMs: Math.max(0, dueAt - now),
    intervalMs: effectiveIntervalMs(baseIntervalMs, health),
    multiplier: healthMultiplier(health),
  };
}

module.exports = {
  DEFAULT_BACKOFF_MULTIPLIER,
  MAX_BACKOFF_MULTIPLIER,
  DEFAULT_STARTUP_WARMUP_MS,
  MIN_STARTUP_WARMUP_MS,
  MAX_STARTUP_WARMUP_MS,
  backoffMultiplier,
  maxBackoffMultiplier,
  startupWarmupMs,
  stableOffsetMs,
  healthMultiplier,
  effectiveIntervalMs,
  nextDueAt,
  decision,
};