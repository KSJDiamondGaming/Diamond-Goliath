'use strict';

const { startupSocialStudio } = require('../../modules/socialStudio/socialStudioMonitor');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    startupSocialStudio(client);
  },
};
