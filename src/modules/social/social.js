'use strict';

const socialManager = require('./socialManager');
const socialStore = require('./socialStore');
const socialScheduler = require('./socialScheduler');
const socialQueue = require('./socialQueue');
const socialHistory = require('./socialHistory');
const socialCreators = require('./socialCreators');
const socialSimulator = require('./socialSimulator');
const providerRegistry = require('./providerRegistry');

const STARTUP_KEY = Symbol.for('goliath.social.startup');

async function startup(client, options = {}) {
  if (!client?.guilds?.cache) throw new Error('Discord client is unavailable.');
  if (client[STARTUP_KEY]) return client[STARTUP_KEY];

  const initialCheck = await socialScheduler.runSocialCheck(client, options);
  const schedulerTimer = socialScheduler.startSocialScheduler(client, options);
  const queueTimer = socialQueue.start(client, options.queue || {});
  client[STARTUP_KEY] = {
    startedAt: new Date().toISOString(),
    initialCheck,
    schedulerTimer,
    queueTimer,
  };
  return client[STARTUP_KEY];
}

module.exports = {
  ...socialManager,
  store: socialStore,
  history: socialHistory,
  queue: socialQueue,
  creators: socialCreators,
  simulator: socialSimulator,
  providers: providerRegistry,
  scheduler: socialScheduler,
  startup,
};
