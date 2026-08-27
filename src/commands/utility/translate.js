'use strict';

const adapter = require('../../core/systems/user/utilities').adapters.translate;
module.exports = {
  hidden: true,
  data: { name: 'translate', description: 'User panel translation utility', toJSON: () => ({ name: 'translate', description: 'User panel translation utility' }) },
  execute: adapter.execute,
};
