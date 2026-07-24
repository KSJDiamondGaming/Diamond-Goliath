'use strict';

const path = require('path');
const fileStore = require('../../core/guild/fileStore');

const DEFAULT_FAILURE_THRESHOLD = 5;
const MIN_FAILURE_THRESHOLD = 2;
const MAX_FAILURE_THRESHOLD = 20;
const DEFAULT_OPEN_MS = 120000;
const MIN_OPEN_MS = 10000;
const MAX_OPEN_MS = 1800000;
const PERSIST_VERSION = 2;
const PERSIST_DELAY_MS = 250;
const MAX_EVENTS = 100;
const MAX_RECOVERY_SAMPLES = 50;

const TRANSIENT_FAILURE_TYPES = new Set([
  'timeout',
  'network',
  'rate_limit',
  'provider_unavailable',
]);

const states = new Map();
let persistenceLoaded = false;
let persistTimer = null;
let dirty = false;

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function failureThreshold(value = process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD) {
  return boundedNumber(value, DEFAULT_FAILURE_THRESHOLD, MIN_FAILURE_THRESHOLD, MAX_FAILURE_THRESHOLD);
}

function openDurationMs(value = process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS) {
  return boundedNumber(value, DEFAULT_OPEN_MS, MIN_OPEN_MS, MAX_OPEN_MS);
}

function persistencePath() {
  const configured = String(process.env.SOCIAL_PROVIDER_HEALTH_PATH || '').trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), 'data', 'social', 'provider-health.json');
}

function keyFor(provider) {
  return String(provider || 'unknown').trim().toLowerCase() || 'unknown';
}

function initialState(provider) {
  return {
    provider: keyFor(provider),
    state: 'closed',
    consecutiveFailures: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    openedAt: null,
    openUntil: null,
    incidentStartedAt: null,
    halfOpenProbeActive: false,
    firstObservedAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureType: null,
    lastError: null,
    lastRecoveredAt: null,
    lastRecoveryDurationMs: 0,
    totalOpenMs: 0,
    recoveryDurationsMs: [],
    events: [],
  };
}

function normalizeEvents(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_EVENTS).map((event) => ({
    at: event?.at || null,
    type: String(event?.type || 'unknown').slice(0, 80),
    from: event?.from || null,
    to: event?.to || null,
    failureType: event?.failureType || null,
    error: event?.error ? String(event.error).slice(0, 1000) : null,
    durationMs: Math.max(0, Number(event?.durationMs || 0)),
  }));
}

function normalizePersistedState(provider, value = {}) {
  const base = initialState(provider);
  const validState = ['closed', 'open', 'half_open'].includes(value.state) ? value.state : base.state;
  return {
    ...base,
    ...value,
    provider: keyFor(provider),
    state: validState,
    consecutiveFailures: Math.max(0, Number(value.consecutiveFailures || 0)),
    totalFailures: Math.max(0, Number(value.totalFailures || 0)),
    totalSuccesses: Math.max(0, Number(value.totalSuccesses || 0)),
    totalOpenMs: Math.max(0, Number(value.totalOpenMs || 0)),
    lastRecoveryDurationMs: Math.max(0, Number(value.lastRecoveryDurationMs || 0)),
    recoveryDurationsMs: (Array.isArray(value.recoveryDurationsMs) ? value.recoveryDurationsMs : [])
      .map((item) => Math.max(0, Number(item || 0)))
      .slice(-MAX_RECOVERY_SAMPLES),
    events: normalizeEvents(value.events),
    halfOpenProbeActive: false,
  };
}

function serializableState(state) {
  return {
    provider: state.provider,
    state: state.state,
    consecutiveFailures: state.consecutiveFailures,
    totalFailures: state.totalFailures,
    totalSuccesses: state.totalSuccesses,
    openedAt: state.openedAt,
    openUntil: state.openUntil,
    incidentStartedAt: state.incidentStartedAt,
    firstObservedAt: state.firstObservedAt,
    lastCheckedAt: state.lastCheckedAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastFailureType: state.lastFailureType,
    lastError: state.lastError,
    lastRecoveredAt: state.lastRecoveredAt,
    lastRecoveryDurationMs: state.lastRecoveryDurationMs,
    totalOpenMs: state.totalOpenMs,
    recoveryDurationsMs: state.recoveryDurationsMs,
    events: state.events,
  };
}

function persistedDocument() {
  return {
    version: PERSIST_VERSION,
    updatedAt: new Date().toISOString(),
    providers: Object.fromEntries(
      [...states.entries()].map(([provider, state]) => [provider, serializableState(state)]),
    ),
  };
}

function restore(document = {}) {
  const providers = document?.providers && typeof document.providers === 'object' && !Array.isArray(document.providers)
    ? document.providers
    : {};
  states.clear();
  for (const [provider, value] of Object.entries(providers)) {
    states.set(keyFor(provider), normalizePersistedState(provider, value));
  }
  persistenceLoaded = true;
  dirty = false;
  return summary();
}

function load() {
  if (persistenceLoaded) return true;
  const document = fileStore.read(persistencePath(), { version: PERSIST_VERSION, providers: {} });
  return restore(document);
}

function flush() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!dirty) return true;
  const written = fileStore.write(persistencePath(), persistedDocument());
  if (written) dirty = false;
  return written;
}

function schedulePersist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flush();
  }, PERSIST_DELAY_MS);
  persistTimer.unref?.();
}

function stateFor(provider) {
  load();
  const key = keyFor(provider);
  if (!states.has(key)) states.set(key, initialState(key));
  return states.get(key);
}

function appendEvent(state, type, now, details = {}) {
  state.events.push({
    at: new Date(now).toISOString(),
    type,
    from: details.from || null,
    to: details.to || null,
    failureType: details.failureType || null,
    error: details.error ? String(details.error).slice(0, 1000) : null,
    durationMs: Math.max(0, Number(details.durationMs || 0)),
  });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function refresh(state, now = Date.now()) {
  if (state.state === 'open' && Date.parse(state.openUntil || '') <= now) {
    const previous = state.state;
    state.state = 'half_open';
    state.halfOpenProbeActive = false;
    appendEvent(state, 'recovery_ready', now, { from: previous, to: state.state });
    schedulePersist();
  }
  return state;
}

function acquire(provider, now = Date.now()) {
  const state = refresh(stateFor(provider), now);
  if (state.state === 'open') {
    return {
      allowed: false,
      reason: 'circuit_open',
      retryAt: state.openUntil,
      remainingMs: Math.max(0, Date.parse(state.openUntil || '') - now),
      state: snapshot(provider, now),
    };
  }
  if (state.state === 'half_open') {
    if (state.halfOpenProbeActive) {
      return {
        allowed: false,
        reason: 'half_open_probe_active',
        retryAt: state.openUntil,
        remainingMs: 0,
        state: snapshot(provider, now),
      };
    }
    state.halfOpenProbeActive = true;
    appendEvent(state, 'recovery_probe_started', now, { from: 'half_open', to: 'half_open' });
    schedulePersist();
  }
  return { allowed: true, probe: state.state === 'half_open', state: snapshot(provider, now) };
}

function isTransientFailure(result = {}) {
  if (result.success === true) return false;
  if (result.timedOut === true) return true;
  return TRANSIENT_FAILURE_TYPES.has(String(result.errorType || result.type || '').toLowerCase());
}

function openCircuit(state, now, errorType, error) {
  const previous = state.state;
  const openMs = openDurationMs();
  state.state = 'open';
  state.openedAt = new Date(now).toISOString();
  state.openUntil = new Date(now + openMs).toISOString();
  state.incidentStartedAt = state.incidentStartedAt || state.openedAt;
  state.halfOpenProbeActive = false;
  state.lastFailureType = errorType || null;
  state.lastError = error || null;
  appendEvent(state, previous === 'half_open' ? 'recovery_probe_failed' : 'circuit_opened', now, {
    from: previous,
    to: 'open',
    failureType: state.lastFailureType,
    error: state.lastError,
  });
}

function record(provider, result = {}, now = Date.now()) {
  const state = refresh(stateFor(provider), now);
  const previousState = state.state;
  const previousFailures = state.consecutiveFailures;
  state.lastCheckedAt = new Date(now).toISOString();
  state.firstObservedAt = state.firstObservedAt || state.lastCheckedAt;

  if (result.success === true) {
    const incidentStarted = Date.parse(state.incidentStartedAt || '');
    const recoveryDurationMs = Number.isFinite(incidentStarted) ? Math.max(0, now - incidentStarted) : 0;
    if (previousState !== 'closed' || previousFailures > 0) {
      state.lastRecoveredAt = state.lastCheckedAt;
      state.lastRecoveryDurationMs = recoveryDurationMs;
      state.totalOpenMs += recoveryDurationMs;
      if (recoveryDurationMs > 0) {
        state.recoveryDurationsMs.push(recoveryDurationMs);
        if (state.recoveryDurationsMs.length > MAX_RECOVERY_SAMPLES) state.recoveryDurationsMs.shift();
      }
      appendEvent(state, 'provider_recovered', now, {
        from: previousState,
        to: 'closed',
        durationMs: recoveryDurationMs,
      });
    }
    state.state = 'closed';
    state.consecutiveFailures = 0;
    state.totalSuccesses += 1;
    state.openedAt = null;
    state.openUntil = null;
    state.incidentStartedAt = null;
    state.halfOpenProbeActive = false;
    state.lastSuccessAt = state.lastCheckedAt;
    state.lastFailureType = null;
    state.lastError = null;
    schedulePersist();
    return snapshot(provider, now);
  }

  state.halfOpenProbeActive = false;
  if (!isTransientFailure(result)) return snapshot(provider, now);

  state.consecutiveFailures += 1;
  state.totalFailures += 1;
  state.lastFailureAt = state.lastCheckedAt;
  state.lastFailureType = result.errorType || result.type || (result.timedOut ? 'timeout' : 'unknown');
  state.lastError = result.error || null;
  appendEvent(state, 'transient_failure', now, {
    from: state.state,
    to: state.state,
    failureType: state.lastFailureType,
    error: state.lastError,
  });

  if (state.state === 'half_open' || state.consecutiveFailures >= failureThreshold()) {
    openCircuit(state, now, state.lastFailureType, state.lastError);
  }
  schedulePersist();
  return snapshot(provider, now);
}

function failureTrend(state, now) {
  const windows = { lastHour: 3600000, last24Hours: 86400000, last7Days: 604800000 };
  const failures = state.events.filter((event) => event.type === 'transient_failure');
  return Object.fromEntries(Object.entries(windows).map(([key, windowMs]) => [
    key,
    failures.filter((event) => {
      const at = Date.parse(event.at || '');
      return Number.isFinite(at) && now - at <= windowMs;
    }).length,
  ]));
}

function analytics(state, now) {
  const firstObserved = Date.parse(state.firstObservedAt || '');
  const incidentStarted = Date.parse(state.incidentStartedAt || '');
  const currentOpenMs = state.state !== 'closed' && Number.isFinite(incidentStarted)
    ? Math.max(0, now - incidentStarted)
    : 0;
  const observedMs = Number.isFinite(firstObserved) ? Math.max(0, now - firstObserved) : 0;
  const downtimeMs = Math.min(observedMs, state.totalOpenMs + currentOpenMs);
  const uptimePercent = observedMs > 0 ? Math.max(0, Math.min(100, ((observedMs - downtimeMs) / observedMs) * 100)) : 100;
  const samples = state.recoveryDurationsMs;
  return {
    observedSince: state.firstObservedAt,
    observedMs,
    downtimeMs,
    currentIncidentMs: currentOpenMs,
    uptimePercent: Number(uptimePercent.toFixed(3)),
    recoveryCount: samples.length,
    meanRecoveryTimeMs: samples.length
      ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : 0,
    lastRecoveryDurationMs: state.lastRecoveryDurationMs,
    failureTrend: failureTrend(state, now),
    recentEvents: state.events.slice(-20).reverse(),
  };
}

function snapshot(provider, now = Date.now()) {
  const state = refresh(stateFor(provider), now);
  return {
    ...state,
    failureThreshold: failureThreshold(),
    openDurationMs: openDurationMs(),
    remainingOpenMs: state.state === 'open'
      ? Math.max(0, Date.parse(state.openUntil || '') - now)
      : 0,
    analytics: analytics(state, now),
  };
}

function summary(now = Date.now()) {
  if (!persistenceLoaded) load();
  const providers = {};
  for (const provider of states.keys()) providers[provider] = snapshot(provider, now);
  return {
    failureThreshold: failureThreshold(),
    openDurationMs: openDurationMs(),
    persistencePath: persistencePath(),
    persistenceLoaded,
    persistenceDirty: dirty,
    openCount: Object.values(providers).filter((item) => item.state === 'open').length,
    halfOpenCount: Object.values(providers).filter((item) => item.state === 'half_open').length,
    providers,
  };
}

function reset(provider, options = {}) {
  load();
  if (provider === undefined) states.clear();
  else states.delete(keyFor(provider));
  if (options.persist !== false) {
    schedulePersist();
    if (options.flush === true) flush();
  }
}

process.once('exit', flush);

module.exports = {
  DEFAULT_FAILURE_THRESHOLD,
  MIN_FAILURE_THRESHOLD,
  MAX_FAILURE_THRESHOLD,
  DEFAULT_OPEN_MS,
  MIN_OPEN_MS,
  MAX_OPEN_MS,
  PERSIST_VERSION,
  MAX_EVENTS,
  MAX_RECOVERY_SAMPLES,
  TRANSIENT_FAILURE_TYPES,
  failureThreshold,
  openDurationMs,
  persistencePath,
  acquire,
  record,
  snapshot,
  summary,
  load,
  restore,
  flush,
  reset,
};