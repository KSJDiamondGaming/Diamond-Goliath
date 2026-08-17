'use strict';

const { Events } = require('discord.js');
const healthWatch = require('../../owner/healthWatch');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await healthWatch.start(client);
  },
};
