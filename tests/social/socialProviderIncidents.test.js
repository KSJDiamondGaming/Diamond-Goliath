'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const incidents = require('../../src/modules/social/socialProviderIncidents');

const originalEscalationMs = process.env.SOCIAL_PROVIDER_INCIDENT_ESCALATION_MS;
const originalMaxAgeMs = process.env.SOCIAL_PROVIDER_INCIDENT_MAX_AGE_MS;

test.beforeEach(() => {
  process.env.SOCIAL_PROVIDER_INCIDENT_ESCALATION_MS = '60000';
  process.env.SOCIAL_PROVIDER_INCIDENT_MAX_AGE_MS = '60000';
});

test.after(() => {
  if (originalEscalationMs === undefined) delete process.env.SOCIAL_PROVIDER_INCIDENT_ESCALATION_MS;
  else process.env.SOCIAL_PROVIDER_INCIDENT_ESCALATION_MS = originalEscalationMs;
  if (originalMaxAgeMs === undefined) delete process.env.SOCIAL_PROVIDER_INCIDENT_MAX_AGE_MS;
  else process.env.SOCIAL_PROVIDER_INCIDENT_MAX_AGE_MS = originalMaxAgeMs;
});

test('incident configuration is bounded', () => {
  assert.equal(incidents.escalationMs(1), incidents.MIN_ESCALATION_MS);
  assert.equal(incidents.escalationMs(999999999), incidents.MAX_ESCALATION_MS);
  assert.equal(incidents.transitionMaxAgeMs(1), incidents.MIN_TRANSITION_MAX_AGE_MS);
  assert.equal(incidents.transitionMaxAgeMs(999999999), incidents.MAX_TRANSITION_MAX_AGE_MS);
});

test('a circuit-open transition creates one outage incident', () => {
  const previous = { provider: 'twitch', state: 'closed', events: [] };
  const current = {
    provider: 'twitch',
    state: 'open',
    incidentStartedAt: new Date(1000).toISOString(),
    openUntil: new Date(61000).toISOString(),
    events: [{ at: new Date(1000).toISOString(), type: 'circuit_opened', from: 'closed', to: 'open', failureType: 'network', error: 'offline' }],
  };

  const incident = incidents.transition(previous, current, 2000);
  assert.equal(incident.kind, 'outage');
  assert.equal(incident.severity, 'warning');
  assert.equal(incident.provider, 'twitch');
  assert.equal(incident.durationMs, 1000);
  assert.equal(incident.failureType, 'network');
});

test('the same provider transition is deduplicated', () => {
  const event = { at: new Date(1000).toISOString(), type: 'circuit_opened', from: 'closed', to: 'open' };
  const previous = { provider: 'youtube', state: 'open', events: [event] };
  const current = { provider: 'youtube', state: 'open', events: [event] };
  assert.equal(incidents.transition(previous, current, 2000), null);
});

test('stale provider transitions are not replayed after history retention expires', () => {
  const current = {
    provider: 'twitch',
    state: 'closed',
    events: [{ at: new Date(1000).toISOString(), type: 'provider_recovered', from: 'half_open', to: 'closed', durationMs: 5000 }],
  };
  assert.equal(incidents.transition({}, current, 61001), null);
});

test('a failed recovery probe creates an error incident', () => {
  const current = {
    provider: 'kick',
    state: 'open',
    incidentStartedAt: new Date(1000).toISOString(),
    events: [{ at: new Date(62000).toISOString(), type: 'recovery_probe_failed', from: 'half_open', to: 'open', failureType: 'rate_limit' }],
  };
  const incident = incidents.transition({}, current, 62000);
  assert.equal(incident.kind, 'recovery_failed');
  assert.equal(incident.severity, 'error');
});

test('provider recovery includes the measured incident duration', () => {
  const current = {
    provider: 'twitch',
    state: 'closed',
    lastRecoveryDurationMs: 90000,
    events: [{ at: new Date(91000).toISOString(), type: 'provider_recovered', from: 'half_open', to: 'closed', durationMs: 90000 }],
  };
  const incident = incidents.transition({}, current, 91000);
  assert.equal(incident.kind, 'recovery');
  assert.equal(incident.severity, 'info');
  assert.equal(incident.durationMs, 90000);
});

test('prolonged open incidents create stable escalation buckets', () => {
  const snapshot = {
    provider: 'youtube',
    state: 'open',
    incidentStartedAt: new Date(1000).toISOString(),
    openUntil: new Date(200000).toISOString(),
    lastFailureType: 'provider_unavailable',
  };
  assert.equal(incidents.escalation(snapshot, 60000), null);
  const first = incidents.escalation(snapshot, 61000);
  const sameBucket = incidents.escalation(snapshot, 119000);
  const nextBucket = incidents.escalation(snapshot, 121000);
  assert.equal(first.severity, 'critical');
  assert.equal(first.id, sameBucket.id);
  assert.notEqual(first.id, nextBucket.id);
});