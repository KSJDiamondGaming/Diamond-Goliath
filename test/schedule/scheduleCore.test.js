'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  nextOccurrence,
  dueReminders,
  rsvpCounts,
} = require('../../src/modules/schedule/schedule');

function event(overrides = {}) {
  return {
    eventId: 'evt_test',
    title: 'Test event',
    status: 'scheduled',
    enabled: true,
    timezone: 'Europe/London',
    startAt: '2026-08-01T18:00:00.000Z',
    endAt: '2026-08-01T19:00:00.000Z',
    reminderMinutes: [1440, 60, 10],
    sentReminders: [],
    rsvps: {},
    recurrence: { type: 'none', interval: 1, count: null, until: null },
    occurrenceIndex: 0,
    ...overrides,
  };
}

test('daily recurrence advances start and end by the configured interval', () => {
  const next = nextOccurrence(event({ recurrence: { type: 'daily', interval: 2, count: null, until: null } }));

  assert.equal(next.startAt, '2026-08-03T18:00:00.000Z');
  assert.equal(next.endAt, '2026-08-03T19:00:00.000Z');
  assert.equal(next.occurrenceIndex, 1);
  assert.equal(next.parentEventId, 'evt_test');
});

test('weekly recurrence advances by complete weeks', () => {
  const next = nextOccurrence(event({ recurrence: { type: 'weekly', interval: 2, count: null, until: null } }));

  assert.equal(next.startAt, '2026-08-15T18:00:00.000Z');
  assert.equal(next.endAt, '2026-08-15T19:00:00.000Z');
});

test('monthly recurrence advances in UTC without changing duration', () => {
  const next = nextOccurrence(event({ recurrence: { type: 'monthly', interval: 1, count: null, until: null } }));

  assert.equal(next.startAt, '2026-09-01T18:00:00.000Z');
  assert.equal(next.endAt, '2026-09-01T19:00:00.000Z');
});

test('recurrence count prevents creating an extra occurrence', () => {
  const next = nextOccurrence(event({
    occurrenceIndex: 2,
    recurrence: { type: 'weekly', interval: 1, count: 3, until: null },
  }));

  assert.equal(next, null);
});

test('recurrence end date prevents occurrences beyond the boundary', () => {
  const next = nextOccurrence(event({
    recurrence: { type: 'daily', interval: 2, count: null, until: '2026-08-02T18:00:00.000Z' },
  }));

  assert.equal(next, null);
});

test('due reminders include only unsent offsets inside the reminder window', () => {
  const scheduled = event({ sentReminders: [60] });
  const timestamp = Date.parse('2026-08-01T17:55:00.000Z');

  assert.deepEqual(dueReminders(scheduled, timestamp), [1440, 10]);
});

test('due reminders ignore completed and disabled events', () => {
  const timestamp = Date.parse('2026-08-01T17:55:00.000Z');

  assert.deepEqual(dueReminders(event({ status: 'completed' }), timestamp), []);
  assert.deepEqual(dueReminders(event({ enabled: false }), timestamp), []);
});

test('RSVP counts include every supported attendance state', () => {
  const counts = rsvpCounts(event({
    rsvps: {
      '100000000000000001': { status: 'going' },
      '100000000000000002': { status: 'going' },
      '100000000000000003': { status: 'maybe' },
      '100000000000000004': { status: 'declined' },
      '100000000000000005': { status: 'waitlist' },
      '100000000000000006': { status: 'unknown' },
    },
  }));

  assert.deepEqual(counts, { going: 2, maybe: 1, declined: 1, waitlist: 1 });
});
