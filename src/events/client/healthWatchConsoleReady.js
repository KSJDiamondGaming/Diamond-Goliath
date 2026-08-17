'use strict';

const { Events } = require('discord.js');
const healthWatch = require('../../owner/healthWatch');
const consoleBridge = require('../../owner/healthWatch/consoleBridge');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    consoleBridge.install(client, healthWatch);
  },
};
