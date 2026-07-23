'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const diagnostics = require('../../src/modules/social/socialIncidentDiagnostics');

function incident(provider, kind, severity, at, id = `${provider}-${kind}-${at}`) {
  return {
    eventType: 'provider_incident',
    platform: provider,
    createdAt: new Date(at).toISOString(),
    error: kind === 'recovery' ? null : 'provider unavailable',
    metadata: {
      incidentId: id,
      kind,
      severity,
      occurredAt: new Date(at).toISOString(),
      durationMs: 1000,
    },
  };
}

test('recent incident window is bounded', () => {
  assert.equal(diagnostics.recentWindowMs(1), diagnostics.MIN_RECENT_WINDOW_MS);
  assert.equal(diagnostics.recentWindowMs(Number.MAX_SAFE_INTEGER), diagnostics.MAX_RECENT_WINDOW_MS);
});

test('summary counts recent incidents and active providers', () => {
  const now = 1000000;
  const entries = [
    incident('twitch', 'outage', 'warning', now - 1000),
    incident('youtube', 'escalation', 'critical', now - 2000),
  ];
  const result = diagnostics.summary(entries, { started: true }, now);
  assert.equal(result.recentCount, 2);
  assert.equal(result.unresolvedCount, 2);
  assert.equal(result.unresolvedCriticalCount, 1);
  assert.equal(result.countsByKind.outage, 1);
  assert.equal(result.countsBySeverity.critical, 1);
});

test('latest recovery resolves a provider incident', () => {
  const now = 1000000;
  const entries = [
    incident('twitch', 'recovery', 'info', now - 1000, 'recovery'),
    incident('twitch', 'outage', 'warning', now - 2000, 'outage'),
  ];
  const result = diagnostics.summary(entries, { started: true }, now);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(result.recoveredCount, 1);
});

test('unrelated social history is ignored', () => {
  const result = diagnostics.summary([
    { eventType: 'provider_check', platform: 'twitch', createdAt: new Date().toISOString() },
  ]);
  assert.equal(result.totalRecorded, 0);
  assert.equal(result.unresolvedCount, 0);
});

test('notification delivery totals are preserved from the latest monitor run', () => {
  const monitor = {
    started: true,
    lastRun: {
      recordedCount: 4,
      notificationCount: 2,
      notificationSkippedCount: 1,
      notificationFailureCount: 1,
      completedAt: '2026-07-23T22:30:00.000Z',
    },
  };
  const result = diagnostics.summary([], monitor);
  assert.deepEqual(result.notifications, {
    attemptedCount: 4,
    sentCount: 2,
    skippedCount: 1,
    failureCount: 1,
    completedAt: '2026-07-23T22:30:00.000Z',
  });
});

test('critical unresolved incidents create an error issue', () => {
  const result = diagnostics.summary([
    incident('youtube', 'escalation', 'critical', Date.now() - 1000),
  ], { started: true });
  const issues = diagnostics.issues(result);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'provider_incidents_critical');
  assert.equal(issues[0].severity, 'error');
});

test('stopped monitor creates an operational warning', () => {
  const issues = diagnostics.issues(diagnostics.summary([], { started: false }));
  assert.equal(issues[0].code, 'provider_incident_monitor_not_started');
  assert.equal(issues[0].severity, 'warning');
});

test('failed and skipped management notifications create warnings', () => {
  const result = diagnostics.summary([], {
    started: true,
    lastRun: {
      recordedCount: 2,
      notificationCount: 0,
      notificationSkippedCount: 1,
      notificationFailureCount: 1,
      completedAt: '2026-07-23T22:30:00.000Z',
    },
  });
  const issues = diagnostics.issues(result);
  assert.deepEqual(issues.map((issue) => issue.code), [
    'provider_incident_notifications_failed',
    'provider_incident_notifications_skipped',
  ]);
  assert.ok(issues.every((issue) => issue.severity === 'warning'));
});