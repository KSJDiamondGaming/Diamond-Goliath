'use strict';

const { Events } = require('discord.js');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    await statsManager.handleVoiceStateUpdate(oldState, newState);
  },
};
