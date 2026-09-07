'use strict';

const { Events } = require('discord.js');
const { startSecurityHealthMonitor } = require('../../core/security/protection/securityHealth');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    startSecurityHealthMonitor(client);
  },
};
