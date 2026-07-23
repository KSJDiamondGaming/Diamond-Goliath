'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const providerHealth = require('../../src/modules/social/socialProviderHealth');

const originalThreshold = process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD;
const originalOpenMs = process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS;

function restoreEnvironment() {
  if (originalThreshold === undefined) delete process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD;
  else process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD = originalThreshold;
  if (originalOpenMs === undefined) delete process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS;
  else process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS = originalOpenMs;
}

test.beforeEach(() => {
  providerHealth.reset(undefined, { persist: false });
  process.env.SOCIAL_PROVIDER_FAILURE_THRESHOLD = '2';
  process.env.SOCIAL_PROVIDER_CIRCUIT_OPEN_MS = '10000';
});

test.after(() => {
  restoreEnvironment();
  providerHealth.reset(undefined, { persist: false });
});

test('recovery analytics record incident duration and mean recovery time', () => {
  providerHealth.record('twitch', { success: false, errorType: 'network', error: 'offline' }, 1000);
  providerHealth.record('twitch', { success: false, errorType: 'provider_unavailable', error: '503' }, 2000);
  providerHealth.acquire('twitch', 12000);
  const recovered = providerHealth.record('twitch', { success: true }, 15000);

  assert.equal(recovered.state, 'closed');
  assert.equal(recovered.lastRecoveryDurationMs, 13000);
  assert.equal(recovered.analytics.recoveryCount, 1);
  assert.equal(recovered.analytics.meanRecoveryTimeMs, 13000);
  assert.equal(recovered.analytics.downtimeMs, 13000);
  assert.equal(recovered.analytics.recentEvents[0].type, 'provider_recovered');
});

test('open incidents contribute live downtime and reduced uptime', () => {
  providerHealth.record('kick', { success: false, errorType: 'timeout' }, 1000);
  const opened = providerHealth.record('kick', { success: false, errorType: 'timeout' }, 2000);
  const current = providerHealth.snapshot('kick', 7000);

  assert.equal(opened.state, 'open');
  assert.equal(current.analytics.currentIncidentMs, 5000);
  assert.equal(current.analytics.observedMs, 6000);
  assert.equal(current.analytics.downtimeMs, 5000);
  assert.ok(current.analytics.uptimePercent > 16 && current.analytics.uptimePercent < 17);
});

test('failure trends use rolling time windows', () => {
  const now = 700000000;
  providerHealth.record('youtube', { success: false, errorType: 'network' }, now - 1000);
  providerHealth.record('youtube', { success: false, errorType: 'network' }, now - 7200000);
  providerHealth.record('youtube', { success: false, errorType: 'network' }, now - 172800000);

  const trend = providerHealth.snapshot('youtube', now).analytics.failureTrend;
  assert.equal(trend.lastHour, 1);
  assert.equal(trend.last24Hours, 2);
  assert.equal(trend.last7Days, 3);
});

test('recovery timeline remains bounded', () => {
  for (let index = 0; index < providerHealth.MAX_EVENTS + 20; index += 1) {
    providerHealth.record('twitch', { success: false, errorType: 'network', error: String(index) }, 1000 + index);
  }
  assert.equal(providerHealth.snapshot('twitch', 5000).events.length, providerHealth.MAX_EVENTS);
});

test('version one provider state restores with analytics defaults', () => {
  providerHealth.restore({
    version: 1,
    providers: {
      twitch: {
        provider: 'twitch',
        state: 'open',
        consecutiveFailures: 5,
        totalFailures: 8,
        openedAt: '1970-01-01T00:00:02.000Z',
        openUntil: '1970-01-01T00:00:12.000Z',
        lastFailureType: 'network',
      },
    },
  });

  const restored = providerHealth.snapshot('twitch', 3000);
  assert.equal(restored.state, 'open');
  assert.equal(restored.totalFailures, 8);
  assert.deepEqual(restored.events, []);
  assert.equal(restored.analytics.recoveryCount, 0);
});
