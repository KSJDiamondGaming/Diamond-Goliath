'use strict';

const voiceLog = require('../../core/logging/voice/voiceLog');
const tempVoice = require('../../modules/utilityStudio/tempVoice/tempVoice');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');

async function runHandler(label, handler, oldState, newState, client) {
  try {
    await handler(oldState, newState, client);
  } catch (error) {
    console.error(`[VoiceStateUpdate] ${label} handler failed:`, error?.stack || error?.message || error);
  }
}

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState, client) {
    await runHandler('Voice Logs', voiceLog.handleVoiceStateUpdate, oldState, newState, client);
    await runHandler('Temp Voice', tempVoice.handleVoiceStateUpdate, oldState, newState, client);
    await runHandler('Stats', statsManager.handleVoiceStateUpdate, oldState, newState, client);
  },
};
