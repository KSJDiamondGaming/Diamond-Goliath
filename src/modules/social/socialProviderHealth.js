'use strict';

const DEFAULT_FAILURE_THRESHOLD = 5;
const MIN_FAILURE_THRESHOLD = 2;
const MAX_FAILURE_THRESHOLD = 20;
const DEFAULT_OPEN_MS = 120000;
const MIN_OPEN_MS = 10000;
const MAX_OPEN_MS = 1800000;

const TRANSIENT_FAILURE_TYPES = new Set([
  'timeout',
  'network',
  'rate_limit',
  'provider_unavailable',
]);

const states = new Map();

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

function stateFor(provider) {
  const key = keyFor(provider);
  if (!states.has(key)) states.set(key, initialState(key));
  return states.get(key);
}

function refresh(state, now = Date.now()) {
  if (state.state === 'open' && Date.parse(state.openUntil || '') <= now) {
    state.state = 'half_open';
    state.halfOpenProbeActive = false;
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
  const providers = {};
  for (const provider of states.keys()) providers[provider] = snapshot(provider, now);
  return {
    failureThreshold: failureThreshold(),
    openDurationMs: openDurationMs(),
    openCount: Object.values(providers).filter((item) => item.state === 'open').length,
    halfOpenCount: Object.values(providers).filter((item) => item.state === 'half_open').length,
    providers,
  };
}

function reset(provider) {
  if (provider === undefined) {
    states.clear();
    return;
  }
  states.delete(keyFor(provider));
}

module.exports = {
  DEFAULT_FAILURE_THRESHOLD,
  MIN_FAILURE_THRESHOLD,
  MAX_FAILURE_THRESHOLD,
  DEFAULT_OPEN_MS,
  MIN_OPEN_MS,
  MAX_OPEN_MS,
  TRANSIENT_FAILURE_TYPES,
  failureThreshold,
  openDurationMs,
  acquire,
  record,
  snapshot,
  summary,
  reset,
};
