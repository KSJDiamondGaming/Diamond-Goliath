const voiceLog = require('../../core/logging/voice/voiceLog');
const tempVoiceManager = require('../../modules/tempvoice/tempVoiceManager');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState, client) {
    await voiceLog.handleVoiceStateUpdate(oldState, newState, client);
    await tempVoiceManager.handleVoiceStateUpdate(oldState, newState, client);
    await statsManager.handleVoiceStateUpdate(oldState, newState, client);
  },
};
