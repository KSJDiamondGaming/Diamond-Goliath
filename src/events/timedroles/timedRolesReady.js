'use strict';

const timedRoles = require('../../modules/timedroles/timedRoles');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    await timedRoles.startup(client);
  },
};
