'use strict';

const { Events } = require('discord.js');
const starboardManager = require('../modules/starboard/starboardManager');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user, client) {
    await starboardManager.handleStarReactionAdd(reaction, user, client).catch((error) => {
      console.error('[Starboard] Failed to handle reaction add:', error);
    });
  },
};
