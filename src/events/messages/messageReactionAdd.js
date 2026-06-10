'use strict';

// src/events/messages/messageReactionAdd.js

const { handleReactionAdd } = require('../../modules/roles/reactionRoleHandler');

module.exports = {
  name: 'messageReactionAdd',

  async execute(reaction, user, client) {
    try {
      await handleReactionAdd(reaction, user, client);
    } catch (error) {
      console.error('[EVENT: messageReactionAdd]', error);
    }
  },
};
