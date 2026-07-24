'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const queue = require('../../src/modules/social/socialQueue');

test.afterEach(() => {
  queue.stop();
});

test('queue status reports the active normalized runtime interval', () => {
  const client = { guilds: { cache: new Map() } };

  queue.start(client, { intervalMs: 12345 });

  const status = queue.status();
  assert.equal(status.started, true);
  assert.equal(status.processing, false);
  assert.equal(status.intervalMs, 12345);
  assert.ok(Number.isFinite(Date.parse(status.startedAt)));
});

test('queue normalizes invalid and out-of-range intervals safely', () => {
  assert.equal(queue.normalizeProcessIntervalMs('invalid'), queue.DEFAULT_PROCESS_INTERVAL_MS);
  assert.equal(queue.normalizeProcessIntervalMs(1), queue.MIN_PROCESS_INTERVAL_MS);
  assert.equal(queue.normalizeProcessIntervalMs(Number.MAX_SAFE_INTEGER), queue.MAX_PROCESS_INTERVAL_MS);
});

test('duplicate starts preserve active settings until stop and restart', () => {
  const client = { guilds: { cache: new Map() } };

  const firstTimer = queue.start(client, { intervalMs: 20000 });
  const duplicateTimer = queue.start(client, { intervalMs: 90000 });

  assert.equal(duplicateTimer, firstTimer);
  assert.equal(queue.status().intervalMs, 20000);

  assert.equal(queue.stop(), true);
  assert.deepEqual(queue.status(), {
    started: false,
    processing: false,
    startedAt: null,
    intervalMs: queue.DEFAULT_PROCESS_INTERVAL_MS,
  });

  queue.start(client, { intervalMs: 90000 });
  assert.equal(queue.status().intervalMs, 90000);
});
