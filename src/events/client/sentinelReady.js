'use strict';

const { Events } = require('discord.js');
const sentinel = require('../../owner/sentinel/index.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await sentinel.start(client);
  },
};
