'use strict';

const socialStore = require('./socialStore');
const socialRuntime = require('./socialRuntime');

module.exports = {
  ...socialRuntime,
  store: socialStore,
};
