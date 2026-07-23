'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const history = require('../../src/modules/social/socialHistory');

function entry(index, eventType = 'alert') {
  return {
    id: `${eventType}-${index}`,
    status: eventType === history.INCIDENT_EVENT_TYPE ? 'failed' : 'sent',
    eventType,
    alertType: 'live',
    platform: 'twitch',
    createdAt: new Date(1700000000000 - index).toISOString(),
  };
}

test('history retention caps provider incidents without consuming operational capacity', () => {
  const entries = [];
  for (let index = 0; index < 250; index += 1) {
    entries.push(entry(index * 2, history.INCIDENT_EVENT_TYPE));
    entries.push(entry((index * 2) + 1, 'alert'));
  }

  const retained = history.trimEntries(entries);
  assert.equal(retained.length, 350);
  assert.equal(retained.filter((item) => item.eventType === history.INCIDENT_EVENT_TYPE).length, history.MAX_INCIDENT_HISTORY);
  assert.equal(retained.filter((item) => item.eventType === 'alert').length, 250);
});

test('history retention preserves original chronological ordering', () => {
  const entries = [
    entry(1, history.INCIDENT_EVENT_TYPE),
    entry(2, 'delivery'),
    entry(3, history.INCIDENT_EVENT_TYPE),
    entry(4, 'alert'),
  ];

  assert.deepEqual(history.trimEntries(entries).map((item) => item.id), entries.map((item) => item.id));
});

test('history retention still enforces the global maximum', () => {
  const entries = Array.from({ length: history.MAX_HISTORY + 50 }, (_, index) => entry(index, 'alert'));
  const retained = history.trimEntries(entries);
  assert.equal(retained.length, history.MAX_HISTORY);
  assert.equal(retained[0].id, 'alert-0');
  assert.equal(retained.at(-1).id, `alert-${history.MAX_HISTORY - 1}`);
});

test('normalization and event type constants are stable', () => {
  const normalized = history.normalizeEntry({ eventType: history.INCIDENT_EVENT_TYPE, status: 'failed' });
  assert.equal(normalized.eventType, 'provider_incident');
  assert.equal(normalized.status, 'failed');
  assert.equal(history.MAX_INCIDENT_HISTORY, 100);
});
