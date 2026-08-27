'use strict';

const adapter = require('../../core/systems/user/utilities').adapters.serverinfo;
module.exports = {
  hidden: true,
  data: { name: 'serverinfo', description: 'User panel server information utility', toJSON: () => ({ name: 'serverinfo', description: 'User panel server information utility' }) },
  execute: adapter.execute,
};
