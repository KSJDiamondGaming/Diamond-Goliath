'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const social = require('../../src/modules/social/social');
const router = require('../../src/modules/social/socialRoute');

function historyHandler() {
  const layer = router.stack.find((item) => item.route?.path === '/:guildId/history' && item.route.methods?.get);
  if (!layer) throw new Error('Social history route was not registered.');
  return layer.route.stack[0].handle;
}

test('history route forwards eventType and existing filters to the history service', () => {
  const originalList = social.history.list;
  const originalSummary = social.history.summary;
  let capturedGuildId = null;
  let capturedOptions = null;
  let payload = null;

  social.history.list = (guildId, options) => {
    capturedGuildId = guildId;
    capturedOptions = options;
    return [{ id: 'incident-1', eventType: 'provider_incident' }];
  };
  social.history.summary = () => ({
    total: 1,
    providerIncidents: 1,
    incidentCapacity: {
      used: 1,
      limit: 100,
      remaining: 99,
      saturated: false,
    },
  });

  try {
    historyHandler()({
      params: { guildId: 'guild-123' },
      query: {
        limit: '25',
        status: 'failed',
        eventType: 'provider_incident',
        accountId: 'account-456',
        platform: 'twitch',
        alertType: 'live',
      },
    }, {
      json(value) {
        payload = value;
        return value;
      },
      status() {
        throw new Error('History route unexpectedly returned an error response.');
      },
    });
  } finally {
    social.history.list = originalList;
    social.history.summary = originalSummary;
  }

  assert.equal(capturedGuildId, 'guild-123');
  assert.deepEqual(capturedOptions, {
    limit: '25',
    status: 'failed',
    eventType: 'provider_incident',
    accountId: 'account-456',
    platform: 'twitch',
    alertType: 'live',
  });
  assert.deepEqual(payload, {
    success: true,
    guildId: 'guild-123',
    summary: {
      total: 1,
      providerIncidents: 1,
      incidentCapacity: {
        used: 1,
        limit: 100,
        remaining: 99,
        saturated: false,
      },
    },
    history: [{ id: 'incident-1', eventType: 'provider_incident' }],
  });
});
