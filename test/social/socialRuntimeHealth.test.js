'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const social = require('../../src/modules/social/social');

const client = { guilds: { cache: new Map() } };
const guildId = '999999999999999992';

test.afterEach(() => {
  social.shutdown(client);
});

test('runtime health reports all active services as healthy', () => {
  social.scheduler.startSocialScheduler(client, {
    tickIntervalMs: 60000,
    concurrency: 3,
  });
  social.queue.start(client, { intervalMs: 20000 });
  social.incidentMonitor.start(client, { intervalMs: 30000 });

  const snapshot = social.runtimeHealth.status();

  assert.equal(snapshot.module, 'social');
  assert.equal(snapshot.healthy, true);
  assert.equal(snapshot.state, 'healthy');
  assert.equal(snapshot.started, true);
  assert.equal(snapshot.errorCount, 0);
  assert.equal(snapshot.warningCount, 0);
  assert.equal(snapshot.scheduler.tickIntervalMs, 60000);
  assert.equal(snapshot.queue.intervalMs, 20000);
  assert.equal(snapshot.incidentMonitor.intervalMs, 30000);
  assert.equal(typeof snapshot.incidentMonitor.activeIncidentCount, 'number');
  assert.ok(Number.isFinite(Date.parse(snapshot.checkedAt)));
  assert.ok(Number.isFinite(Date.parse(snapshot.startedAt)));
});

test('runtime health reports stopped services as explicit errors', () => {
  const snapshot = social.runtimeHealth.status();

  assert.equal(snapshot.healthy, false);
  assert.equal(snapshot.state, 'error');
  assert.equal(snapshot.started, false);
  assert.equal(snapshot.errorCount, 3);
  assert.deepEqual(
    snapshot.issues.map((issue) => issue.code).sort(),
    ['incident_monitor_stopped', 'queue_stopped', 'scheduler_stopped'],
  );
});

test('runtime health can include a guild queue summary', () => {
  const snapshot = social.runtimeHealth.status({ guildId });

  assert.deepEqual(snapshot.queue.summary, {
    total: 0,
    queued: 0,
    failed: 0,
    nextAttemptAt: null,
  });
});
