'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pollingPolicy = require('../../src/modules/social/socialPollingPolicy');

const originalBackoff = process.env.SOCIAL_PROVIDER_BACKOFF_MULTIPLIER;
const originalMaxBackoff = process.env.SOCIAL_PROVIDER_MAX_BACKOFF_MULTIPLIER;
const originalWarmup = process.env.SOCIAL_PROVIDER_STARTUP_WARMUP_MS;

test.beforeEach(() => {
  process.env.SOCIAL_PROVIDER_BACKOFF_MULTIPLIER = '2';
  process.env.SOCIAL_PROVIDER_MAX_BACKOFF_MULTIPLIER = '16';
  process.env.SOCIAL_PROVIDER_STARTUP_WARMUP_MS = '120000';
});

test.after(() => {
  if (originalBackoff === undefined) delete process.env.SOCIAL_PROVIDER_BACKOFF_MULTIPLIER;
  else process.env.SOCIAL_PROVIDER_BACKOFF_MULTIPLIER = originalBackoff;
  if (originalMaxBackoff === undefined) delete process.env.SOCIAL_PROVIDER_MAX_BACKOFF_MULTIPLIER;
  else process.env.SOCIAL_PROVIDER_MAX_BACKOFF_MULTIPLIER = originalMaxBackoff;
  if (originalWarmup === undefined) delete process.env.SOCIAL_PROVIDER_STARTUP_WARMUP_MS;
  else process.env.SOCIAL_PROVIDER_STARTUP_WARMUP_MS = originalWarmup;
});

test('adaptive polling configuration is bounded', () => {
  assert.equal(pollingPolicy.backoffMultiplier(0), 1);
  assert.equal(pollingPolicy.backoffMultiplier(99), 4);
  assert.equal(pollingPolicy.maxBackoffMultiplier(0), 1);
  assert.equal(pollingPolicy.maxBackoffMultiplier(999), 64);
  assert.equal(pollingPolicy.startupWarmupMs(-1), 0);
  assert.equal(pollingPolicy.startupWarmupMs(9999999), pollingPolicy.MAX_STARTUP_WARMUP_MS);
});

test('healthy providers use the configured base interval', () => {
  assert.equal(pollingPolicy.healthMultiplier({ state: 'closed', consecutiveFailures: 0 }), 1);
  assert.equal(pollingPolicy.effectiveIntervalMs(300000, { state: 'closed' }), 300000);
});

test('degraded providers back off exponentially with a cap', () => {
  assert.equal(pollingPolicy.healthMultiplier({ state: 'closed', consecutiveFailures: 1 }), 2);
  assert.equal(pollingPolicy.healthMultiplier({ state: 'closed', consecutiveFailures: 3 }), 8);
  assert.equal(pollingPolicy.healthMultiplier({ state: 'closed', consecutiveFailures: 10 }), 16);
  assert.equal(pollingPolicy.effectiveIntervalMs(300000, { state: 'closed', consecutiveFailures: 3 }), 2400000);
});

test('open circuits defer polling until their recovery time', () => {
  const health = { state: 'open', openUntil: new Date(50000).toISOString() };
  const result = pollingPolicy.decision({ accountId: 'one' }, 300000, health, { now: 10000 });
  assert.equal(result.due, false);
  assert.equal(result.reason, 'provider_circuit_open');
  assert.equal(result.nextDueAt, 50000);
  assert.equal(result.remainingMs, 40000);
  assert.equal(result.multiplier, Infinity);
});

test('half-open providers are immediately due for a controlled recovery probe', () => {
  const result = pollingPolicy.decision(
    { accountId: 'one', lastSeen: { lastCheckedAt: new Date(9000).toISOString() } },
    300000,
    { state: 'half_open' },
    { now: 10000 },
  );
  assert.equal(result.due, true);
  assert.equal(result.reason, 'recovery_probe_due');
  assert.equal(result.nextDueAt, 10000);
});

test('startup warmup offsets are deterministic and bounded', () => {
  const first = pollingPolicy.stableOffsetMs('twitch:creator-one', 120000);
  const second = pollingPolicy.stableOffsetMs('twitch:creator-one', 120000);
  const other = pollingPolicy.stableOffsetMs('youtube:creator-two', 120000);
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 120000);
  assert.ok(other >= 0 && other <= 120000);
});

test('new accounts are distributed through the startup warmup window', () => {
  const account = { accountId: 'creator-one', platform: 'twitch' };
  const dueAt = pollingPolicy.nextDueAt(account, 300000, { state: 'closed' }, {
    now: 1000,
    startupAt: 1000,
    startupWarmupMs: 120000,
  });
  assert.ok(dueAt >= 1000 && dueAt <= 121000);

  const before = pollingPolicy.decision(account, 300000, { state: 'closed' }, {
    now: dueAt - 1,
    startupAt: 1000,
    startupWarmupMs: 120000,
  });
  const at = pollingPolicy.decision(account, 300000, { state: 'closed' }, {
    now: dueAt,
    startupAt: 1000,
    startupWarmupMs: 120000,
  });
  assert.equal(before.due, false);
  assert.equal(before.reason, 'startup_warmup');
  assert.equal(at.due, true);
});

test('forced checks bypass adaptive delays', () => {
  const result = pollingPolicy.decision(
    { accountId: 'one' },
    300000,
    { state: 'open', openUntil: new Date(999999).toISOString() },
    { now: 10000, force: true },
  );
  assert.equal(result.due, true);
  assert.equal(result.reason, 'forced');
});