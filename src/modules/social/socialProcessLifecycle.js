'use strict';

const social = require('./social');

const LIFECYCLE_KEY = Symbol.for('goliath.social.processLifecycle');
const SIGNAL_EXIT_CODES = Object.freeze({ SIGINT: 130, SIGTERM: 143 });

function register(client, options = {}) {
  const signalSource = options.signalSource || process;
  const exit = options.exit || ((code) => process.exit(code));
  const destroyClient = options.destroyClient !== false;

  if (!client) throw new Error('Discord client is unavailable.');
  if (client[LIFECYCLE_KEY]) return client[LIFECYCLE_KEY];

  let stopping = false;
  const handlers = {};

  async function stop(signal = 'SIGTERM') {
    if (stopping) return false;
    stopping = true;

    try {
      social.shutdown(client);
      if (destroyClient && typeof client.destroy === 'function') {
        await Promise.resolve(client.destroy());
      }
    } finally {
      exit(SIGNAL_EXIT_CODES[signal] || 0);
    }

    return true;
  }

  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    handlers[signal] = () => stop(signal);
    signalSource.once(signal, handlers[signal]);
  }

  const registration = Object.freeze({ stop, handlers, registeredAt: new Date().toISOString() });
  client[LIFECYCLE_KEY] = registration;
  return registration;
}

function unregister(client, options = {}) {
  const signalSource = options.signalSource || process;
  const registration = client?.[LIFECYCLE_KEY];
  if (!registration) return false;

  for (const [signal, handler] of Object.entries(registration.handlers || {})) {
    signalSource.removeListener(signal, handler);
  }

  delete client[LIFECYCLE_KEY];
  return true;
}

module.exports = {
  LIFECYCLE_KEY,
  SIGNAL_EXIT_CODES,
  register,
  unregister,
};
