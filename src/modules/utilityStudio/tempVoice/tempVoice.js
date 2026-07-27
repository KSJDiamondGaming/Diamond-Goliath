'use strict';

const tempVoiceManager = require('./tempVoiceManager');
const tempVoiceStore = require('./tempVoiceStore');
const tempVoiceStartup = require('./tempVoiceStartup');

module.exports = {
  ...tempVoiceManager,
  store: tempVoiceStore,
  startup: tempVoiceStartup.startup,
  shutdown: tempVoiceStartup.shutdown,
  getConfig: tempVoiceStore.getTempVoiceSection,
  getHubs: tempVoiceStore.getHubs,
  getHub: tempVoiceStore.getHub,
  getTempChannel: tempVoiceStore.getTempChannel,
};
