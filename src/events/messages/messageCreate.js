'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const { handlePrefixCommand } = require('../../features/prefix/prefixRouter');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingManager = require('../../modules/communityStudio/leveling/levelingManager');

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      if (!message.guild || !message.member) return;
      if (!message.content || message.author?.bot) return;

      await statsManager.handleMessageCreate(message);
      await levelingManager.handleMessageCreate(message);

      const handledPrefixCommand = await handlePrefixCommand(message, client);
      if (handledPrefixCommand) return;

      await translationThreadManager.handleMessageCreate(message, client);
      await handleStickyMessage(message, client);
    } catch (error) {
      console.error('[EVENT: messageCreate]', error);
    }
  },
};