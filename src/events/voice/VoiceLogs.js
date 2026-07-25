const voiceLog = require('../../core/logging/voice/voiceLog');
const tempVoiceManager = require('../../modules/utilityStudio/tempVoice/tempVoiceManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState, client) {
    await voiceLog.handleVoiceStateUpdate(oldState, newState, client);
    await tempVoiceManager.handleVoiceStateUpdate(oldState, newState, client);
    await statsManager.handleVoiceStateUpdate(oldState, newState, client);
  },
};
