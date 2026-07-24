'use strict';

const { Events } = require('discord.js');
const social = require('../../modules/social/social');
const socialProcessLifecycle = require('../../modules/social/socialProcessLifecycle');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await social.startup(client);
    socialProcessLifecycle.register(client);
  },
};
