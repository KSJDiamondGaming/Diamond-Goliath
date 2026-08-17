'use strict';

const { Events } = require('discord.js');
const healthWatch = require('../../owner/healthWatch/index');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await healthWatch.start(client);
  },
};
