'use strict';

const { Events } = require('discord.js');
const starboardManager = require('../modules/starboard/starboardManager');

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user, client) {
    await starboardManager.handleStarReactionRemove(reaction, user, client).catch((error) => {
      console.error('[Starboard] Failed to handle reaction remove:', error);
    });
  },
};
