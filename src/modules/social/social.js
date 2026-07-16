'use strict';

const socialManager = require('./socialManager');
const socialStore = require('./socialStore');
const socialScheduler = require('./socialScheduler');
const providerRegistry = require('./providerRegistry');

const STARTUP_KEY = Symbol.for('goliath.social.startup');

async function startup(client, options = {}) {
  if (!client?.guilds?.cache) throw new Error('Discord client is unavailable.');
  if (client[STARTUP_KEY]) return client[STARTUP_KEY];

  const initialCheck = await socialScheduler.runSocialCheck(client, options);
  const timer = socialScheduler.startSocialScheduler(client, options);
  client[STARTUP_KEY] = {
    startedAt: new Date().toISOString(),
    initialCheck,
    timer,
  };
  return client[STARTUP_KEY];
}

module.exports = {
  ...socialManager,
  store: socialStore,
  providers: providerRegistry,
  scheduler: socialScheduler,
  startup,
};
