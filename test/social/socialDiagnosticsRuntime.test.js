'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const social = require('../../src/modules/social/social');

const client = { guilds: { cache: new Map() } };
const guildId = 'guild-diagnostics-runtime';

test.afterEach(() => {
  social.shutdown(client);
});

test('diagnostics includes the canonical stopped runtime snapshot', () => {
  const diagnostics = social.diagnostics.buildDiagnostics(guildId);

  assert.equal(diagnostics.module, 'social');
  assert.equal(diagnostics.guildId, guildId);
  assert.equal(diagnostics.runtime.module, 'social');
  assert.equal(diagnostics.runtime.healthy, false);
  assert.equal(diagnostics.runtime.state, 'error');
  assert.equal(diagnostics.runtime.errorCount, 3);
  assert.deepEqual(diagnostics.runtime.queue.summary, {
    total: 0,
    queued: 0,
    failed: 0,
    nextAttemptAt: null,
  });
});

test('diagnostics reflects the active canonical runtime configuration', () => {
  social.scheduler.startSocialScheduler(client, {
    tickIntervalMs: 120000,
    concurrency: 6,
  });
  social.queue.start(client, { intervalMs: 45000 });
  social.incidentMonitor.start(client, { intervalMs: 75000 });

  const diagnostics = social.diagnostics.buildDiagnostics(guildId);

  assert.equal(diagnostics.runtime.healthy, true);
  assert.equal(diagnostics.runtime.started, true);
  assert.equal(diagnostics.runtime.scheduler.tickIntervalMs, 120000);
  assert.equal(diagnostics.runtime.scheduler.concurrency, 6);
  assert.equal(diagnostics.runtime.queue.intervalMs, 45000);
  assert.equal(diagnostics.runtime.incidentMonitor.intervalMs, 75000);
});

test('the diagnostics HTTP consumer receives the same embedded runtime shape', () => {
  const responsePayload = {
    success: true,
    diagnostics: social.diagnostics.buildDiagnostics(guildId),
  };

  assert.equal(responsePayload.diagnostics.runtime.module, 'social');
  assert.equal(typeof responsePayload.diagnostics.runtime.checkedAt, 'string');
  assert.ok(Array.isArray(responsePayload.diagnostics.runtime.issues));
});
