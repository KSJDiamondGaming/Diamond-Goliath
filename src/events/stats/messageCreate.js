'use strict';

const { Events } = require('discord.js');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    await statsManager.handleMessageCreate(message);
  },
};
