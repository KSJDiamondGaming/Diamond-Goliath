'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const originalThreshold = process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD;
const originalOpenMs = process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS;
const originalHealthPath = process.env.SOCIAL_PROVIDER_HEALTH_PATH;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goliath-social-health-'));
process.env.SOCIAL_PROVIDER_HEALTH_PATH = path.join(testDir, 'provider-health.json');

const providerHealth = require('../../src/modules/social/socialProviderHealth');

function cleanState() {
  providerHealth.reset(undefined, { persist: false });
  providerHealth.restore({ version: providerHealth.PERSIST_VERSION, providers: {} });
  try { fs.rmSync(process.env.SOCIAL_PROVIDER_HEALTH_PATH, { force: true }); } catch {}
}

test.beforeEach(() => {
  cleanState();
  process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD = '2';
  process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS = '10000';
});

test.after(() => {
  cleanState();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  if (originalThreshold === undefined) delete process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD;
  else process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD = originalThreshold;
  if (originalOpenMs === undefined) delete process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS;
  else process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS = originalOpenMs;
  if (originalHealthPath === undefined) delete process.env.SOCIAL_PROVIDER_HEALTH_PATH;
  else process.env.SOCIAL_PROVIDER_HEALTH_PATH = originalHealthPath;
});

test('provider health configuration is bounded', () => {
  assert.equal(providerHealth.failureThreshold(1), providerHealth.MIN_FAILURE_THRESHOLD);
  assert.equal(providerHealth.failureThreshold(999), providerHealth.MAX_FAILURE_THRESHOLD);
  assert.equal(providerHealth.openDurationMs(1), providerHealth.MIN_OPEN_MS);
  assert.equal(providerHealth.openDurationMs(99999999), providerHealth.MAX_OPEN_MS);
});

test('transient failures open the provider circuit at the configured threshold', () => {
  const first = providerHealth.record('twitch', { success: false, errorType: 'network', error: 'offline' }, 1000);
  assert.equal(first.state, 'closed');
  assert.equal(first.consecutiveFailures, 1);

  const second = providerHealth.record('twitch', { success: false, errorType: 'provider_unavailable', error: '503' }, 2000);
  assert.equal(second.state, 'open');
  assert.equal(second.consecutiveFailures, 2);
  assert.equal(Date.parse(second.openUntil), 12000);

  const gate = providerHealth.acquire('twitch', 3000);
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, 'circuit_open');
  assert.equal(gate.remainingMs, 9000);
});

test('non-transient failures do not open the provider circuit', () => {
  providerHealth.record('youtube', { success: false, errorType: 'authentication', error: 'invalid key' }, 1000);
  providerHealth.record('youtube', { success: false, errorType: 'request_rejected', error: 'bad channel' }, 2000);

  const state = providerHealth.snapshot('youtube', 3000);
  assert.equal(state.state, 'closed');
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.totalFailures, 0);
});

test('only one recovery probe runs while a circuit is half open', () => {
  providerHealth.record('kick', { success: false, timedOut: true, error: 'timeout' }, 1000);
  providerHealth.record('kick', { success: false, timedOut: true, error: 'timeout' }, 2000);

  const firstProbe = providerHealth.acquire('kick', 12000);
  assert.equal(firstProbe.allowed, true);
  assert.equal(firstProbe.probe, true);

  const secondProbe = providerHealth.acquire('kick', 12000);
  assert.equal(secondProbe.allowed, false);
  assert.equal(secondProbe.reason, 'half_open_probe_active');
});

test('a successful recovery probe closes and resets the circuit', () => {
  providerHealth.record('twitch', { success: false, errorType: 'network' }, 1000);
  providerHealth.record('twitch', { success: false, errorType: 'network' }, 2000);
  providerHealth.acquire('twitch', 12000);

  const recovered = providerHealth.record('twitch', { success: true }, 12001);
  assert.equal(recovered.state, 'closed');
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.openUntil, null);
  assert.equal(providerHealth.acquire('twitch', 12002).allowed, true);
});

test('a failed recovery probe reopens the circuit', () => {
  providerHealth.record('kick', { success: false, errorType: 'network' }, 1000);
  providerHealth.record('kick', { success: false, errorType: 'network' }, 2000);
  providerHealth.acquire('kick', 12000);

  const failedProbe = providerHealth.record('kick', { success: false, errorType: 'rate_limit', error: '429' }, 12001);
  assert.equal(failedProbe.state, 'open');
  assert.equal(Date.parse(failedProbe.openUntil), 22001);
});

test('summary reports provider circuit counts', () => {
  providerHealth.record('twitch', { success: false, errorType: 'network' }, 1000);
  providerHealth.record('twitch', { success: false, errorType: 'network' }, 2000);
  providerHealth.record('youtube', { success: true }, 2000);

  const summary = providerHealth.summary(3000);
  assert.equal(summary.openCount, 1);
  assert.equal(summary.halfOpenCount, 0);
  assert.equal(summary.providers.twitch.state, 'open');
  assert.equal(summary.providers.youtube.state, 'closed');
  assert.equal(summary.persistencePath, path.resolve(process.env.SOCIAL_PROVIDER_HEALTH_PATH));
});

test('provider circuit state survives persistence and restore', () => {
  providerHealth.record('twitch', { success: false, errorType: 'network', error: 'offline' }, 1000);
  providerHealth.record('twitch', { success: false, errorType: 'provider_unavailable', error: '503' }, 2000);
  assert.equal(providerHealth.flush(), true);
  assert.equal(fs.existsSync(process.env.SOCIAL_PROVIDER_HEALTH_PATH), true);

  const persisted = JSON.parse(fs.readFileSync(process.env.SOCIAL_PROVIDER_HEALTH_PATH, 'utf8'));
  assert.equal(persisted.version, providerHealth.PERSIST_VERSION);
  assert.equal(persisted.providers.twitch.state, 'open');
  assert.equal(persisted.providers.twitch.consecutiveFailures, 2);

  providerHealth.restore({ version: providerHealth.PERSIST_VERSION, providers: {} });
  assert.equal(providerHealth.summary(3000).openCount, 0);

  providerHealth.restore(persisted);
  const restored = providerHealth.snapshot('twitch', 3000);
  assert.equal(restored.state, 'open');
  assert.equal(restored.consecutiveFailures, 2);
  assert.equal(restored.lastFailureType, 'provider_unavailable');
});

test('restored half-open probe locks are cleared after restart', () => {
  providerHealth.restore({
    version: providerHealth.PERSIST_VERSION,
    providers: {
      kick: {
        provider: 'kick',
        state: 'half_open',
        consecutiveFailures: 2,
        halfOpenProbeActive: true,
      },
    },
  });

  const gate = providerHealth.acquire('kick', 12000);
  assert.equal(gate.allowed, true);
  assert.equal(gate.probe, true);
});