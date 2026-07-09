'use strict';

const { Events } = require('discord.js');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: Events.ClientReady,
  async execute(client) {
    statsManager.startCounterRefreshScheduler(client);
  },
};
