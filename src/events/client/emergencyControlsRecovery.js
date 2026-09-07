'use strict';

const { Events } = require('discord.js');
const {
  recoverEmergencyControls,
  startEmergencyControlRecoveryScheduler,
} = require('../../core/security/protection/emergencyControls');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      const result = await recoverEmergencyControls(client);
      console.log(`[SecurityEmergencyControls] Startup recovery: ${result.guilds} guild(s), ${result.invitesRestored} invite freeze(s) restored, ${result.rolesRestored} role freeze(s) restored, ${result.failed} failed.`);
    } catch (error) {
      console.error('[SecurityEmergencyControls] Startup recovery failed:', error);
    }
    startEmergencyControlRecoveryScheduler(client);
  },
};