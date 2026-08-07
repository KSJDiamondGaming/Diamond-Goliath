'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPermanentLoginError,
  isTransientLoginError,
  retryDelay,
  loginWithRetry,
} = require('../../src/runtime/discordLogin');

test('classifies Discord 5xx and rate limits as transient', () => {
  assert.equal(isTransientLoginError({ status: 503, message: 'Service Unavailable' }), true);
  assert.equal(isTransientLoginError({ status: 502 }), true);
  assert.equal(isTransientLoginError({ status: 429 }), true);
  assert.equal(isTransientLoginError({ code: 'ETIMEDOUT' }), true);
});

test('classifies authentication failures as permanent', () => {
  assert.equal(isPermanentLoginError({ status: 401 }), true);
  assert.equal(isPermanentLoginError({ status: 403 }), true);
  assert.equal(isPermanentLoginError({ code: 'TokenInvalid' }), true);
  assert.equal(isPermanentLoginError({ code: 'DisallowedIntents' }), true);
});

test('retry delay backs off and respects its cap', () => {
  assert.equal(retryDelay(1, 1000, 5000), 1000);
  assert.equal(retryDelay(2, 1000, 5000), 2000);
  assert.equal(retryDelay(3, 1000, 5000), 4000);
  assert.equal(retryDelay(4, 1000, 5000), 5000);
});

test('loginWithRetry recovers after transient failures', async () => {
  let attempts = 0;
  let destroys = 0;
  const client = {
    async login() {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('Service Unavailable');
        error.status = 503;
        throw error;
      }
      return 'ok';
    },
    destroy() {
      destroys += 1;
    },
  };

  const result = await loginWithRetry(client, 'token', {
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 1,
    label: 'TestDiscord',
  });

  assert.equal(result, true);
  assert.equal(attempts, 3);
  assert.equal(destroys, 2);
});

test('loginWithRetry fails immediately for permanent auth errors', async () => {
  let attempts = 0;
  const client = {
    async login() {
      attempts += 1;
      const error = new Error('Unauthorized');
      error.status = 401;
      throw error;
    },
    destroy() {},
  };

  await assert.rejects(
    loginWithRetry(client, 'token', {
      maxAttempts: 4,
      baseDelayMs: 1,
      maxDelayMs: 1,
      label: 'TestDiscord',
    }),
    /Unauthorized/
  );
  assert.equal(attempts, 1);
});
