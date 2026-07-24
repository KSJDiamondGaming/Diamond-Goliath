'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const social = require('../../src/modules/social/social');

const STARTUP_KEY = Symbol.for('goliath.social.startup');
const originals = {
  stopScheduler: social.scheduler.stopSocialScheduler,
  stopQueue: social.queue.stop,
  stopIncidents: social.incidentMonitor.stop,
};

test.afterEach(() => {
  social.scheduler.stopSocialScheduler = originals.stopScheduler;
  social.queue.stop = originals.stopQueue;
  social.incidentMonitor.stop = originals.stopIncidents;
});

test('canonical shutdown stops every Social Studio timer and clears startup state', () => {
  const calls = [];
  social.scheduler.stopSocialScheduler = () => { calls.push('scheduler'); return true; };
  social.queue.stop = () => { calls.push('queue'); return true; };
  social.incidentMonitor.stop = () => { calls.push('incidents'); return true; };

  const client = { [STARTUP_KEY]: { startedAt: new Date().toISOString() } };
  const result = social.shutdown(client);

  assert.deepEqual(calls, ['scheduler', 'queue', 'incidents']);
  assert.deepEqual(result, {
    stopped: true,
    schedulerStopped: true,
    queueStopped: true,
    incidentMonitorStopped: true,
    startupStateCleared: true,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(client, STARTUP_KEY), false);
});

test('canonical shutdown is safe when Social Studio is already stopped', () => {
  social.scheduler.stopSocialScheduler = () => false;
  social.queue.stop = () => false;
  social.incidentMonitor.stop = () => false;

  assert.deepEqual(social.shutdown({}), {
    stopped: false,
    schedulerStopped: false,
    queueStopped: false,
    incidentMonitorStopped: false,
    startupStateCleared: false,
  });
});