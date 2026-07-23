'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const socialManager = require('../../src/modules/social/socialManager');
const notifier = require('../../src/modules/social/socialIncidentNotifier');

const originalGetConfig = socialManager.getConfig;

function incident(overrides = {}) {
  return {
    provider: 'twitch',
    kind: 'outage',
    severity: 'warning',
    occurredAt: '2026-07-23T20:00:00.000Z',
    durationMs: 65000,
    retryAt: '2026-07-23T20:02:00.000Z',
    failureType: 'network',
    error: 'provider unavailable',
    previousState: 'closed',
    currentState: 'open',
    ...overrides,
  };
}

test.after(() => {
  socialManager.getConfig = originalGetConfig;
});

test('duration formatting is concise and stable', () => {
  assert.equal(notifier.formatDuration(5000), '5s');
  assert.equal(notifier.formatDuration(65000), '1m 5s');
  assert.equal(notifier.formatDuration(7260000), '2h 1m');
});

test('payload disables mentions and includes provider details', () => {
  const payload = notifier.buildPayload(incident());
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.equal(payload.embeds[0].title, 'TWITCH provider outage detected');
  assert.equal(payload.embeds[0].color, notifier.COLORS.warning);
  assert.equal(payload.embeds[0].fields.find((field) => field.name === 'Duration').value, '1m 5s');
});

test('recovery payload uses success wording and colour', () => {
  const payload = notifier.buildPayload(incident({ kind: 'recovery', severity: 'info', currentState: 'closed' }));
  assert.equal(payload.embeds[0].title, 'TWITCH provider recovered');
  assert.equal(payload.embeds[0].color, notifier.COLORS.info);
  assert.match(payload.embeds[0].description, /recovered/i);
});

test('notification is skipped when no log channel is configured', async () => {
  socialManager.getConfig = () => ({ logChannelId: null });
  const result = await notifier.notify('guild-1', incident(), {});
  assert.deepEqual(result, { sent: false, skipped: true, reason: 'log_channel_not_configured' });
});

test('notification sends to the configured log channel', async () => {
  socialManager.getConfig = () => ({ logChannelId: 'log-1' });
  let sentPayload;
  const client = {
    channels: {
      cache: new Map([['log-1', {
        send: async (payload) => {
          sentPayload = payload;
          return { id: 'message-1' };
        },
      }]]),
    },
  };

  const result = await notifier.notify('guild-1', incident(), client);
  assert.equal(result.sent, true);
  assert.equal(result.channelId, 'log-1');
  assert.equal(result.messageId, 'message-1');
  assert.equal(sentPayload.allowedMentions.parse.length, 0);
});

test('notification failure is returned without throwing', async () => {
  socialManager.getConfig = () => ({ logChannelId: 'log-1' });
  const client = {
    channels: {
      cache: new Map([['log-1', { send: async () => { throw new Error('missing permission'); } }]]),
    },
  };

  const result = await notifier.notify('guild-1', incident(), client);
  assert.equal(result.sent, false);
  assert.equal(result.skipped, false);
  assert.equal(result.error, 'missing permission');
});
