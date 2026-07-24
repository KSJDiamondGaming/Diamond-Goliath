'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const scheduler = require('../../src/modules/social/socialScheduler');

test.afterEach(() => {
  scheduler.stopSocialScheduler();
});

test('scheduler status reports the active normalized runtime configuration', () => {
  const client = { guilds: { cache: new Map() } };

  scheduler.startSocialScheduler(client, {
    tickIntervalMs: 90000,
    concurrency: 7,
    providerTimeoutMs: 45000,
    startupWarmupMs: 30000,
  });

  const status = scheduler.getSchedulerStatus();
  assert.equal(status.started, true);
  assert.equal(status.tickIntervalMs, 90000);
  assert.equal(status.concurrency, 7);
  assert.equal(status.providerTimeoutMs, 45000);
  assert.equal(status.startupWarmupMs, 30000);
  assert.ok(Number.isFinite(Date.parse(status.startedAt)));
});

test('duplicate starts preserve the active configuration until a restart', () => {
  const client = { guilds: { cache: new Map() } };

  const firstTimer = scheduler.startSocialScheduler(client, {
    tickIntervalMs: 60000,
    concurrency: 2,
  });
  const duplicateTimer = scheduler.startSocialScheduler(client, {
    tickIntervalMs: 180000,
    concurrency: 9,
  });

  assert.equal(duplicateTimer, firstTimer);
  assert.equal(scheduler.getSchedulerStatus().tickIntervalMs, 60000);
  assert.equal(scheduler.getSchedulerStatus().concurrency, 2);

  assert.equal(scheduler.stopSocialScheduler(), true);
  assert.equal(scheduler.getSchedulerStatus().started, false);
  assert.equal(scheduler.getSchedulerStatus().startedAt, null);

  scheduler.startSocialScheduler(client, {
    tickIntervalMs: 180000,
    concurrency: 9,
  });

  assert.equal(scheduler.getSchedulerStatus().tickIntervalMs, 180000);
  assert.equal(scheduler.getSchedulerStatus().concurrency, 9);
});
