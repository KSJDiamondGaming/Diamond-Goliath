'use strict';

const INCIDENT_EVENT_TYPE = 'provider_incident';
const DEFAULT_RECENT_WINDOW_MS = 86400000;
const MIN_RECENT_WINDOW_MS = 60000;
const MAX_RECENT_WINDOW_MS = 2592000000;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function recentWindowMs(value = process.env.SOCIAL_PROVIDER_INCIDENT_RECENT_MS) {
  return boundedNumber(value, DEFAULT_RECENT_WINDOW_MS, MIN_RECENT_WINDOW_MS, MAX_RECENT_WINDOW_MS);
}

function isIncident(entry = {}) {
  return entry.eventType === INCIDENT_EVENT_TYPE;
}

function incidentKind(entry = {}) {
  return String(entry.metadata?.kind || '').toLowerCase();
}

function incidentSeverity(entry = {}) {
  return String(entry.metadata?.severity || '').toLowerCase();
}

function occurredAt(entry = {}) {
  return entry.metadata?.occurredAt || entry.createdAt || null;
}

function isRecent(entry, now = Date.now(), windowMs = recentWindowMs()) {
  const timestamp = Date.parse(occurredAt(entry) || '');
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= windowMs;
}

function latestByProvider(entries = []) {
  const latest = new Map();
  for (const entry of entries.filter(isIncident)) {
    const provider = String(entry.platform || '').toLowerCase();
    if (!provider || latest.has(provider)) continue;
    latest.set(provider, entry);
  }
  return latest;
}

function unresolved(entries = []) {
  const latest = latestByProvider(entries);
  return [...latest.values()].filter((entry) => incidentKind(entry) !== 'recovery');
}

function notificationSummary(monitor = {}) {
  const lastRun = monitor.lastRun || {};
  return {
    attemptedCount: Number(lastRun.recordedCount || 0),
    sentCount: Number(lastRun.notificationCount || 0),
    skippedCount: Number(lastRun.notificationSkippedCount || 0),
    failureCount: Number(lastRun.notificationFailureCount || 0),
    completedAt: lastRun.completedAt || null,
  };
}

function summary(entries = [], monitor = {}, now = Date.now()) {
  const incidents = entries.filter(isIncident);
  const recent = incidents.filter((entry) => isRecent(entry, now));
  const active = unresolved(incidents);
  const countsByKind = {};
  const countsBySeverity = {};

  for (const entry of recent) {
    const kind = incidentKind(entry) || 'unknown';
    const severity = incidentSeverity(entry) || 'unknown';
    countsByKind[kind] = Number(countsByKind[kind] || 0) + 1;
    countsBySeverity[severity] = Number(countsBySeverity[severity] || 0) + 1;
  }

  return {
    monitor,
    notifications: notificationSummary(monitor),
    recentWindowMs: recentWindowMs(),
    totalRecorded: incidents.length,
    recentCount: recent.length,
    unresolvedCount: active.length,
    unresolvedCriticalCount: active.filter((entry) => ['critical', 'error'].includes(incidentSeverity(entry))).length,
    recoveredCount: incidents.filter((entry) => incidentKind(entry) === 'recovery').length,
    countsByKind,
    countsBySeverity,
    unresolved: active.map((entry) => ({
      incidentId: entry.metadata?.incidentId || null,
      provider: entry.platform || null,
      kind: incidentKind(entry) || null,
      severity: incidentSeverity(entry) || null,
      occurredAt: occurredAt(entry),
      incidentStartedAt: entry.metadata?.incidentStartedAt || null,
      durationMs: Number(entry.metadata?.durationMs || 0),
      failureType: entry.metadata?.failureType || null,
      error: entry.error || null,
      retryAt: entry.metadata?.retryAt || null,
    })),
    latestAt: incidents[0]?.createdAt || null,
  };
}

function issues(diagnostics = {}) {
  const output = [];
  if (diagnostics.monitor?.started === false) {
    output.push({ code: 'provider_incident_monitor_not_started', severity: 'warning' });
  }
  if (diagnostics.notifications?.failureCount > 0) {
    output.push({
      code: 'provider_incident_notifications_failed',
      severity: 'warning',
      count: diagnostics.notifications.failureCount,
      completedAt: diagnostics.notifications.completedAt,
    });
  }
  if (diagnostics.notifications?.skippedCount > 0) {
    output.push({
      code: 'provider_incident_notifications_skipped',
      severity: 'warning',
      count: diagnostics.notifications.skippedCount,
      completedAt: diagnostics.notifications.completedAt,
    });
  }
  if (diagnostics.unresolvedCriticalCount > 0) {
    output.push({
      code: 'provider_incidents_critical',
      severity: 'error',
      count: diagnostics.unresolvedCriticalCount,
      providers: diagnostics.unresolved
        .filter((item) => ['critical', 'error'].includes(item.severity))
        .map((item) => item.provider),
    });
  } else if (diagnostics.unresolvedCount > 0) {
    output.push({
      code: 'provider_incidents_unresolved',
      severity: 'warning',
      count: diagnostics.unresolvedCount,
      providers: diagnostics.unresolved.map((item) => item.provider),
    });
  }
  return output;
}

module.exports = {
  INCIDENT_EVENT_TYPE,
  DEFAULT_RECENT_WINDOW_MS,
  MIN_RECENT_WINDOW_MS,
  MAX_RECENT_WINDOW_MS,
  recentWindowMs,
  isIncident,
  incidentKind,
  incidentSeverity,
  occurredAt,
  isRecent,
  latestByProvider,
  unresolved,
  notificationSummary,
  summary,
  issues,
};