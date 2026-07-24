'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const lifecycle = require('../../src/modules/social/socialProcessLifecycle');

function fakeClient() {
  return {
    destroyed: 0,
    destroy() {
      this.destroyed += 1;
    },
  };
}

test('register installs one handler for each supported shutdown signal', () => {
  const signals = new EventEmitter();
  const client = fakeClient();
  const registration = lifecycle.register(client, { signalSource: signals, exit() {} });

  assert.equal(signals.listenerCount('SIGINT'), 1);
  assert.equal(signals.listenerCount('SIGTERM'), 1);
  assert.equal(lifecycle.register(client, { signalSource: signals, exit() {} }), registration);
  assert.equal(signals.listenerCount('SIGINT'), 1);
  assert.equal(signals.listenerCount('SIGTERM'), 1);

  lifecycle.unregister(client, { signalSource: signals });
});

test('SIGTERM performs canonical shutdown once and exits with signal code', async () => {
  const signals = new EventEmitter();
  const client = fakeClient();
  const exits = [];
  const registration = lifecycle.register(client, { signalSource: signals, exit: (code) => exits.push(code) });

  const first = await registration.stop('SIGTERM');
  const second = await registration.stop('SIGTERM');

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(client.destroyed, 1);
  assert.deepEqual(exits, [143]);

  lifecycle.unregister(client, { signalSource: signals });
});

test('unregister removes signal handlers and client registration', () => {
  const signals = new EventEmitter();
  const client = fakeClient();
  lifecycle.register(client, { signalSource: signals, exit() {} });

  assert.equal(lifecycle.unregister(client, { signalSource: signals }), true);
  assert.equal(lifecycle.unregister(client, { signalSource: signals }), false);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  assert.equal(client[lifecycle.LIFECYCLE_KEY], undefined);
});

test('social ready event starts runtime before registering shutdown lifecycle', () => {
  const readyPath = path.resolve(__dirname, '../../src/events/social/socialReady.js');
  const source = fs.readFileSync(readyPath, 'utf8');
  const startupIndex = source.indexOf('await social.startup(client)');
  const lifecycleIndex = source.indexOf('socialProcessLifecycle.register(client)');

  assert.ok(startupIndex >= 0);
  assert.ok(lifecycleIndex > startupIndex);
  assert.match(source, /once:\s*true/);
});
