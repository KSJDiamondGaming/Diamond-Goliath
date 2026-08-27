'use strict';

const adapter = require('../../core/systems/user/utilities').adapters.help;
module.exports = {
  hidden: true,
  data: { name: 'help', description: 'User panel help utility', toJSON: () => ({ name: 'help', description: 'User panel help utility' }) },
  execute: adapter.execute,
};
