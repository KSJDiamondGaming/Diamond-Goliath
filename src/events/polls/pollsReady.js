'use strict';

const { Events } = require('discord.js');
const polls = require('../../modules/polls/polls');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await polls.startup(client);
  },
};
