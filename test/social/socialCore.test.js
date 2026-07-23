'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const providerRegistry = require('../../src/modules/social/providerRegistry');
const socialHttp = require('../../src/modules/social/socialHttp');
const socialStore = require('../../src/modules/social/socialStore');
const socialHistory = require('../../src/modules/social/socialHistory');
const deliveryGuard = require('../../src/modules/social/socialDeliveryGuard');

const originalFetch = global.fetch;
const originalGetSocialSection = socialStore.getSocialSection;
const originalCleanKey = socialStore.cleanKey;
const originalHistoryRecord = socialHistory.record;

function installStore(section, history = []) {
  socialStore.getSocialSection = () => section;
  socialStore.cleanKey = (value) => String(value);
  socialHistory.record = (guildId, entry, meta) => {
    history.push({ guildId, entry, meta });
    return entry;
  };
}

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    text: async () => body === undefined ? '' : JSON.stringify(body),
  };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  socialStore.getSocialSection = originalGetSocialSection;
  socialStore.cleanKey = originalCleanKey;
  socialHistory.record = originalHistoryRecord;
  assert.equal(deliveryGuard.summary().activeLocks, 0);
});

test('provider timeout values are normalized and clamped', () => {
  assert.equal(providerRegistry.normalizeTimeoutMs(undefined), providerRegistry.DEFAULT_PROVIDER_TIMEOUT_MS);
  assert.equal(providerRegistry.normalizeTimeoutMs('invalid'), providerRegistry.DEFAULT_PROVIDER_TIMEOUT_MS);
  assert.equal(providerRegistry.normalizeTimeoutMs(1), providerRegistry.MIN_PROVIDER_TIMEOUT_MS);
  assert.equal(providerRegistry.normalizeTimeoutMs(7000.4), 7000);
  assert.equal(providerRegistry.normalizeTimeoutMs(999999), providerRegistry.MAX_PROVIDER_TIMEOUT_MS);
});

test('social HTTP values are normalized and clamped', () => {
  assert.equal(socialHttp.normalizeTimeoutMs(undefined), socialHttp.DEFAULT_TIMEOUT_MS);
  assert.equal(socialHttp.normalizeTimeoutMs(1), socialHttp.MIN_TIMEOUT_MS);
  assert.equal(socialHttp.normalizeTimeoutMs(999999), socialHttp.MAX_TIMEOUT_MS);
  assert.equal(socialHttp.normalizeRetries(-1), 0);
  assert.equal(socialHttp.normalizeRetries(999), socialHttp.MAX_RETRIES);
});

test('social HTTP client parses JSON and records request metadata', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://provider.test/resource');
    assert.equal(options.headers.Accept, 'application/json');
    assert.match(options.headers['User-Agent'], /^Goliath-Social-Studio\//);
    return response(200, { ok: true });
  };

  const result = await socialHttp.requestJson('https://provider.test/resource', {
    provider: 'test-provider',
    retries: 0,
  });

  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.status, 200);
  assert.equal(result.attempts, 1);
  assert.ok(result.responseTimeMs >= 0);
  const metrics = socialHttp.summary().byProvider['test-provider'];
  assert.ok(metrics.requests >= 1);
  assert.ok(metrics.successes >= 1);
});

test('social HTTP client retries provider failures and preserves classification', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls === 1
      ? response(503, { message: 'Unavailable' })
      : response(200, { recovered: true });
  };

  const result = await socialHttp.requestJson('https://provider.test/retry', {
    provider: 'retry-provider',
    retries: 1,
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.data, { recovered: true });
  assert.equal(result.attempts, 2);
  assert.ok(socialHttp.summary().byProvider['retry-provider'].retries >= 1);
});

test('social HTTP client classifies authentication failures without retrying', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return response(401, { message: 'Unauthorized' });
  };

  await assert.rejects(
    socialHttp.requestJson('https://provider.test/auth', {
      provider: 'auth-provider',
      retries: 2,
    }),
    (error) => error.status === 401 && error.type === 'authentication',
  );
  assert.equal(calls, 1);
});

test('delivery locks serialize operations for the same account', async () => {
  const events = [];
  const account = { accountId: 'creator-1' };

  const first = deliveryGuard.withDeliveryLock('guild-1', account, {}, async () => {
    events.push('first:start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push('first:end');
  });
  const second = deliveryGuard.withDeliveryLock('guild-1', account, {}, async () => {
    events.push('second:start');
    events.push('second:end');
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('delivery locks do not block different accounts', async () => {
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let secondRan = false;

  const first = deliveryGuard.withDeliveryLock('guild-1', { accountId: 'creator-1' }, {}, async () => {
    await firstStarted;
  });
  const second = deliveryGuard.withDeliveryLock('guild-1', { accountId: 'creator-2' }, {}, async () => {
    secondRan = true;
  });

  await second;
  assert.equal(secondRan, true);
  releaseFirst();
  await first;
});

test('duplicate content is suppressed using fresh persisted state', () => {
  const history = [];
  installStore({
    settings: { suppressDuplicates: true, cooldownMs: 0 },
    accounts: {
      'creator-1': {
        accountId: 'creator-1',
        platform: 'twitch',
        displayName: 'Creator',
        lastSeen: { lastContentId: 'stream-123' },
      },
    },
  }, history);

  const decision = deliveryGuard.evaluate(
    'guild-1',
    { accountId: 'creator-1', lastSeen: {} },
    { alertType: 'live', contentId: 'stream-123' },
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'duplicate_content');
  assert.equal(history.length, 1);
  assert.equal(history[0].entry.eventType, 'duplicate');
});

test('duplicate suppression can be disabled explicitly', () => {
  installStore({
    settings: { suppressDuplicates: false, cooldownMs: 0 },
    accounts: {
      'creator-1': {
        accountId: 'creator-1',
        lastSeen: { lastContentId: 'stream-123' },
      },
    },
  });

  const decision = deliveryGuard.evaluate(
    'guild-1',
    { accountId: 'creator-1' },
    { contentId: 'stream-123' },
  );

  assert.equal(decision.allowed, true);
});

test('active cooldown suppresses a new alert and reports remaining time', () => {
  const history = [];
  installStore({
    settings: { suppressDuplicates: true, cooldownMs: 60000 },
    accounts: {
      'creator-1': {
        accountId: 'creator-1',
        lastSeen: { lastAlertAt: new Date(Date.now() - 1000).toISOString() },
      },
    },
  }, history);

  const decision = deliveryGuard.evaluate(
    'guild-1',
    { accountId: 'creator-1' },
    { contentId: 'new-content' },
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'cooldown_active');
  assert.ok(decision.remainingMs > 0 && decision.remainingMs <= 60000);
  assert.equal(history[0].entry.eventType, 'cooldown');
});

test('expired cooldown allows delivery', () => {
  installStore({
    settings: { suppressDuplicates: true, cooldownMs: 1000 },
    accounts: {
      'creator-1': {
        accountId: 'creator-1',
        lastSeen: { lastAlertAt: new Date(Date.now() - 5000).toISOString() },
      },
    },
  });

  const decision = deliveryGuard.evaluate(
    'guild-1',
    { accountId: 'creator-1' },
    { contentId: 'new-content' },
  );

  assert.equal(decision.allowed, true);
});