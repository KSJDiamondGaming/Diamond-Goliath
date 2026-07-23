'use strict';

const socialStore = require('./socialStore');
const socialRuntime = require('./socialRuntime');

module.exports = {
  ...socialRuntime,
  store: socialStore,
  http: require('./socialHttp'),
  providerHealth: require('./socialProviderHealth'),
  pollingPolicy: require('./socialPollingPolicy'),
};

Object.defineProperty(module.exports, 'health', {
  enumerable: true,
  configurable: false,
  get() {
    return require('./socialHealth');
  },
});