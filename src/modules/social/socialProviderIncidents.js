'use strict';

const DEFAULT_ESCALATION_MS = 900000;
const MIN_ESCALATION_MS = 60000;
const MAX_ESCALATION_MS = 86400000;

const INCIDENT_EVENT_TYPES = new Set([
  'circuit_opened',
  'recovery_probe_failed',
  'provider_recovered',
]);

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function escalationMs(value = process.env.SOCIAL_PROVIDER_INCIDENT_ESCALATION_MS) {
  return boundedNumber(value, DEFAULT_ESCALATION_MS, MIN_ESCALATION_MS, MAX_ESCALATION_MS);
}

function eventsFrom(snapshot = {}) {
  if (Array.isArray(snapshot.events)) return snapshot.events;
  if (Array.isArray(snapshot.analytics?.recentEvents)) return snapshot.analytics.recentEvents;
  return [];
}

function eventKey(provider, event = {}) {
  return [
    String(provider || 'unknown').toLowerCase(),
    event.type || 'unknown',
    event.at || '',
    event.durationMs || 0,
  ].join(':');
}

function latestIncidentEvent(snapshot = {}) {
  const events = eventsFrom(snapshot);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (INCIDENT_EVENT_TYPES.has(events[index]?.type)) return events[index];
  }
  return null;
}

function severityFor(type, durationMs = 0) {
  if (type === 'provider_recovered') return 'info';
  if (durationMs >= escalationMs()) return 'critical';
  if (type === 'recovery_probe_failed') return 'error';
  return 'warning';
}

function transition(previous = {}, current = {}, now = Date.now()) {
  const event = latestIncidentEvent(current);
  if (!event) return null;
  const provider = current.provider || previous.provider || 'unknown';
  const currentKey = eventKey(provider, event);
  const previousEvent = latestIncidentEvent(previous);
  if (previousEvent && eventKey(provider, previousEvent) === currentKey) return null;

  const incidentStarted = Date.parse(current.incidentStartedAt || '');
  const durationMs = event.type === 'provider_recovered'
    ? Math.max(0, Number(event.durationMs || current.lastRecoveryDurationMs || 0))
    : Number.isFinite(incidentStarted) ? Math.max(0, now - incidentStarted) : 0;

  const kind = event.type === 'provider_recovered'
    ? 'recovery'
    : event.type === 'recovery_probe_failed' ? 'recovery_failed' : 'outage';

  return {
    id: currentKey,
    provider,
    kind,
    eventType: event.type,
    severity: severityFor(event.type, durationMs),
    occurredAt: event.at || new Date(now).toISOString(),
    incidentStartedAt: current.incidentStartedAt || current.openedAt || null,
    durationMs,
    retryAt: current.openUntil || null,
    failureType: event.failureType || current.lastFailureType || null,
    error: event.error || current.lastError || null,
    previousState: event.from || previous.state || null,
    currentState: event.to || current.state || null,
    health: current,
  };
}

function escalation(snapshot = {}, now = Date.now()) {
  if (!['open', 'half_open'].includes(snapshot.state)) return null;
  const startedAt = Date.parse(snapshot.incidentStartedAt || snapshot.openedAt || '');
  if (!Number.isFinite(startedAt)) return null;
  const durationMs = Math.max(0, now - startedAt);
  const thresholdMs = escalationMs();
  if (durationMs < thresholdMs) return null;
  const bucket = Math.floor(durationMs / thresholdMs);
  return {
    id: `${snapshot.provider}:escalation:${startedAt}:${bucket}`,
    provider: snapshot.provider,
    kind: 'escalation',
    eventType: 'incident_escalated',
    severity: 'critical',
    occurredAt: new Date(now).toISOString(),
    incidentStartedAt: new Date(startedAt).toISOString(),
    durationMs,
    retryAt: snapshot.openUntil || null,
    failureType: snapshot.lastFailureType || null,
    error: snapshot.lastError || null,
    previousState: snapshot.state,
    currentState: snapshot.state,
    health: snapshot,
  };
}

module.exports = {
  DEFAULT_ESCALATION_MS,
  MIN_ESCALATION_MS,
  MAX_ESCALATION_MS,
  INCIDENT_EVENT_TYPES,
  escalationMs,
  eventKey,
  latestIncidentEvent,
  severityFor,
  transition,
  escalation,
};
