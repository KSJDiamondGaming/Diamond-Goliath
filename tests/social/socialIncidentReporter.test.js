'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const socialHistory = require('../../src/modules/social/socialHistory');
const reporter = require('../../src/modules/social/socialIncidentReporter');

const originalList = socialHistory.list;
const originalRecord = socialHistory.record;

let entries;

test.beforeEach(() => {
  entries = [];
  socialHistory.list = () => entries;
  socialHistory.record = (_guildId, entry) => {
    const stored = { ...entry, metadata: { ...(entry.metadata || {}) } };
    entries.unshift(stored);
    return stored;
  };
});

test.after(() => {
  socialHistory.list = originalList;
  socialHistory.record = originalRecord;
});

function incident(overrides = {}) {
  return {
    id: 'twitch:circuit_opened:2026-07-23T12:00:00.000Z:0',
    provider: 'twitch',
    kind: 'outage',
    eventType: 'circuit_opened',
    severity: 'warning',
    occurredAt: '2026-07-23T12:00:00.000Z',
    incidentStartedAt: '2026-07-23T12:00:00.000Z',
    durationMs: 5000,
    retryAt: '2026-07-23T12:02:00.000Z',
    failureType: 'network',
    error: 'offline',
    previousState: 'closed',
    currentState: 'open',
    ...overrides,
  };
}

test('records one guild-level provider outage event', () => {
  const result = reporter.record('guild-1', incident());
  assert.equal(result.recorded, true);
  assert.equal(result.entry.eventType, reporter.INCIDENT_HISTORY_TYPE);
  assert.equal(result.entry.status, 'skipped');
  assert.equal(result.entry.reason, 'provider_outage_detected');
  assert.equal(result.entry.metadata.severity, 'warning');
});

test('deduplicates the same incident id for a guild', () => {
  const value = incident();
  assert.equal(reporter.record('guild-1', value).recorded, true);
  const duplicate = reporter.record('guild-1', value);
  assert.equal(duplicate.recorded, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(entries.length, 1);
});

test('critical escalation is stored as a failed operational event', () => {
  const result = reporter.record('guild-1', incident({
    id: 'twitch:escalation:1:1',
    kind: 'escalation',
    eventType: 'incident_escalated',
    severity: 'critical',
  }));
  assert.equal(result.entry.status, 'failed');
  assert.equal(result.entry.reason, 'provider_incident_escalated');
});

test('provider recovery is stored as a sent operational event', () => {
  const result = reporter.record('guild-1', incident({
    id: 'twitch:provider_recovered:2026-07-23T12:03:00.000Z:180000',
    kind: 'recovery',
    eventType: 'provider_recovered',
    severity: 'info',
    currentState: 'closed',
    durationMs: 180000,
  }));
  assert.equal(result.entry.status, 'sent');
  assert.equal(result.entry.reason, 'provider_recovered');
  assert.equal(result.entry.metadata.durationMs, 180000);
});

test('result helper ignores provider checks without a transition', () => {
  assert.deepEqual(reporter.recordFromResult('guild-1', { success: true }), {
    recorded: false,
    reason: 'no_provider_incident',
  });
});