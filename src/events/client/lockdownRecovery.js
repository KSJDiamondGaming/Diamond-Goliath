'use strict';

const { Events } = require('discord.js');
const { startLockdownRecoveryScheduler } = require('../../core/security/protection/lockdown');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    startLockdownRecoveryScheduler(client);
  },
};
