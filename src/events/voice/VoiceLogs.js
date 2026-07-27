const voiceLog = require('../../core/logging/voice/voiceLog');
const tempVoice = require('../../modules/utilityStudio/tempVoice/tempVoice');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState, client) {
    await voiceLog.handleVoiceStateUpdate(oldState, newState, client);
    await tempVoice.handleVoiceStateUpdate(oldState, newState, client);
    await statsManager.handleVoiceStateUpdate(oldState, newState, client);
  },
};
