const voiceLog = require('../../logging/voice/voiceLog');
const tempVoiceManager = require('../../modules/tempvoice/tempVoiceManager');

module.exports = {
  name: 'voiceStateUpdate',

  async execute(oldState, newState, client) {
    await voiceLog.handleVoiceStateUpdate(oldState, newState, client);
    await tempVoiceManager.handleVoiceStateUpdate(oldState, newState, client);
  },
};
