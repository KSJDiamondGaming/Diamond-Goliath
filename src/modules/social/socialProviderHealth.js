'use strict';

const path = require('path');
const fileStore = require('../../core/guild/fileStore');

const DEFAULT_FAILURE_THRESHOLD = 5;
const MIN_FAILURE_THRESHOLD = 2;
const MAX_FAILURE_THRESHOLD = 20;
const DEFAULT_OPEN_MS = 120000;
const MIN_OPEN_MS = 10000;
const MAX_OPEN_MS = 1800000;
const PERSIST_VERSION = 1;
const PERSIST_DELAY_MS = 250;

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
    halfOpenProbeActive: false,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureType: null,
    lastError: null,
  };
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
    lastCheckedAt: state.lastCheckedAt,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    lastFailureType: state.lastFailureType,
    lastError: state.lastError,
  };
}

function persistedDocument() {
  return {
    version: PERSIST_VERSION,
    updatedAt: new Date().toISOString(),
    providers: Object.fromEntries(
      [...states.entries()].map(([provider, state]) => [provider, serializableState(state)])
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
  if (persistenceLoaded) return summary();
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

function refresh(state, now = Date.now()) {
  if (state.state === 'open' && Date.parse(state.openUntil || '') <= now) {
    state.state = 'half_open';
    state.halfOpenProbeActive = false;
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
  }
  return { allowed: true, probe: state.state === 'half_open', state: snapshot(provider, now) };
}

function isTransientFailure(result = {}) {
  if (result.success === true) return false;
  if (result.timedOut === true) return true;
  return TRANSIENT_FAILURE_TYPES.has(String(result.errorType || result.type || '').toLowerCase());
}

function openCircuit(state, now, errorType, error) {
  const openMs = openDurationMs();
  state.state = 'open';
  state.openedAt = new Date(now).toISOString();
  state.openUntil = new Date(now + openMs).toISOString();
  state.halfOpenProbeActive = false;
  state.lastFailureType = errorType || null;
  state.lastError = error || null;
}

function record(provider, result = {}, now = Date.now()) {
  const state = refresh(stateFor(provider), now);
  const previousState = state.state;
  const previousFailures = state.consecutiveFailures;
  state.lastCheckedAt = new Date(now).toISOString();

  if (result.success === true) {
    state.state = 'closed';
    state.consecutiveFailures = 0;
    state.totalSuccesses += 1;
    state.openedAt = null;
    state.openUntil = null;
    state.halfOpenProbeActive = false;
    state.lastSuccessAt = state.lastCheckedAt;
    state.lastFailureType = null;
    state.lastError = null;
    if (previousState !== 'closed' || previousFailures > 0) schedulePersist();
    return snapshot(provider, now);
  }

  state.halfOpenProbeActive = false;
  if (!isTransientFailure(result)) return snapshot(provider, now);

  state.consecutiveFailures += 1;
  state.totalFailures += 1;
  state.lastFailureAt = state.lastCheckedAt;
  state.lastFailureType = result.errorType || result.type || (result.timedOut ? 'timeout' : 'unknown');
  state.lastError = result.error || null;

  if (state.state === 'half_open' || state.consecutiveFailures >= failureThreshold()) {
    openCircuit(state, now, state.lastFailureType, state.lastError);
  }
  schedulePersist();
  return snapshot(provider, now);
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

process.once('beforeExit', flush);
process.once('SIGINT', flush);
process.once('SIGTERM', flush);

module.exports = {
  DEFAULT_FAILURE_THRESHOLD,
  MIN_FAILURE_THRESHOLD,
  MAX_FAILURE_THRESHOLD,
  DEFAULT_OPEN_MS,
  MIN_OPEN_MS,
  MAX_OPEN_MS,
  PERSIST_VERSION,
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