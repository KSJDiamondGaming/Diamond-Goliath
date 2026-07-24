'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const doctor = require('../../scripts/social-runtime-doctor');

function snapshot(overrides = {}) {
  return {
    module: 'social',
    checkedAt: '2026-07-24T06:00:00.000Z',
    state: 'healthy',
    healthy: true,
    started: true,
    startedAt: '2026-07-24T05:00:00.000Z',
    warningCount: 0,
    errorCount: 0,
    scheduler: { started: true, startedAt: '2026-07-24T05:00:00.000Z', tickIntervalMs: 120000, lastRun: null },
    queue: { started: true, startedAt: '2026-07-24T05:00:00.000Z', intervalMs: 45000, lastRun: null },
    incidentMonitor: { started: true, startedAt: '2026-07-24T05:00:00.000Z', intervalMs: 75000, lastRun: null },
    issues: [],
    ...overrides,
  };
}

test('doctor reports the canonical healthy runtime snapshot', () => {
  const report = doctor.buildReport(snapshot());

  assert.equal(report.module, 'social');
  assert.equal(report.state, 'healthy');
  assert.equal(report.healthy, true);
  assert.deepEqual(report.components.map((component) => component.started), [true, true, true]);
  assert.deepEqual(report.components.map((component) => component.intervalMs), [120000, 45000, 75000]);
});

test('doctor preserves warning runtime state and recommendations', () => {
  const report = doctor.buildReport(snapshot({
    state: 'warning',
    healthy: true,
    warningCount: 1,
    issues: [{ component: 'scheduler', code: 'scheduler_last_run_failed', severity: 'warning', message: 'provider timeout' }],
  }));

  assert.equal(report.state, 'warning');
  assert.equal(report.warningCount, 1);
  assert.match(report.issues[0].recommendation, /scheduler last-run error/i);
});

test('doctor reports stopped services without mutating runtime state', () => {
  const input = snapshot({
    state: 'error',
    healthy: false,
    started: false,
    startedAt: null,
    errorCount: 3,
    scheduler: { started: false, tickIntervalMs: 120000 },
    queue: { started: false, intervalMs: 45000 },
    incidentMonitor: { started: false, intervalMs: 75000 },
    issues: [
      { component: 'scheduler', code: 'scheduler_stopped', severity: 'error' },
      { component: 'queue', code: 'queue_stopped', severity: 'error' },
      { component: 'incident_monitor', code: 'incident_monitor_stopped', severity: 'error' },
    ],
  });
  const before = JSON.stringify(input);
  const report = doctor.buildReport(input);

  assert.equal(report.errorCount, 3);
  assert.deepEqual(report.components.map((component) => component.started), [false, false, false]);
  assert.match(report.issues[0].recommendation, /canonical social\.startup/i);
  assert.equal(JSON.stringify(input), before);
});

test('doctor rejects missing canonical runtime health', () => {
  assert.throws(() => doctor.buildReport(null), /runtime health is unavailable/i);
  assert.throws(() => doctor.buildReport({ module: 'other' }), /runtime health is unavailable/i);
});

test('package doctor commands include social runtime diagnostics', () => {
  const packageJson = require('../../package.json');

  assert.match(packageJson.scripts.doctor, /social-runtime-doctor\.js/);
  assert.match(packageJson.scripts['doctor:social'], /social-runtime-doctor\.js/);
  assert.match(packageJson.scripts.audit, /social-runtime-doctor\.js/);
});