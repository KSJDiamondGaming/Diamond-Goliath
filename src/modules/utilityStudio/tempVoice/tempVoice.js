'use strict';

const tempVoiceRuntime = require('./tempVoiceManager');
const tempVoiceStore = require('./tempVoiceStore');
const tempVoicePanel = require('./tempVoicePanel');
const tempVoiceHealth = require('./tempVoiceHealth');
const tempVoiceStartup = require('./tempVoiceStartup');

module.exports = {
  ...tempVoiceRuntime,
  store: tempVoiceStore,
  panel: tempVoicePanel,
  health: tempVoiceHealth,
  startup: tempVoiceStartup.startup,
  shutdown: tempVoiceStartup.shutdown,
  getConfig: tempVoiceStore.getTempVoiceSection,
  getHubs: tempVoiceStore.getHubs,
  getHub: tempVoiceStore.getHub,
  getTempChannel: tempVoiceStore.getTempChannel,
  buildHealth: tempVoiceHealth.buildHealth,
  repair: tempVoiceHealth.repair,
};
