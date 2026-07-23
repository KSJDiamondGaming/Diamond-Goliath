'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const providerRegistry = require('../../src/modules/social/providerRegistry');
const socialStore = require('../../src/modules/social/socialStore');
const socialHistory = require('../../src/modules/social/socialHistory');
const deliveryGuard = require('../../src/modules/social/socialDeliveryGuard');

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

test.afterEach(() => {
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
