'use strict';

const socialStore = require('./socialStore');
const socialRuntime = require('./socialRuntime');
const socialHealth = require('./socialHealth');

module.exports = {
  ...socialRuntime,
  store: socialStore,
  health: socialHealth,
};
