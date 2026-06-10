'use strict';

// src/events/messages/messageReactionRemove.js

const { handleReactionRemove } = require('../../modules/roles/reactionRoleHandler');
const { leaveGiveaway } = require('../../modules/giveaways/giveawayManager');

module.exports = {
  name: 'messageReactionRemove',

  async execute(reaction, user, client) {
    try {
      await handleReactionRemove(reaction, user, client);
      await leaveGiveaway(reaction, user, client);
    } catch (error) {
      console.error('[EVENT: messageReactionRemove]', error);
    }
  },
};
