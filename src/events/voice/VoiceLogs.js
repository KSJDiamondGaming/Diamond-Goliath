const voiceLog = require('../../logging/voice/voiceLog');

module.exports = {
  name: 'voiceStateUpdate',
  execute: voiceLog.handleVoiceStateUpdate,
};