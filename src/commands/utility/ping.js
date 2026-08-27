'use strict';

const adapter = require('../../core/systems/user/utilities').adapters.ping;
module.exports = {
  hidden: true,
  data: { name: 'ping', description: 'User panel status utility', toJSON: () => ({ name: 'ping', description: 'User panel status utility' }) },
  execute: adapter.execute,
};
