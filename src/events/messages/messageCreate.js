'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const { handlePrefixCommand } = require('../../features/prefix/prefixRouter');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');

async function runHandler(label, handler, ...args) {
  try {
    return await handler(...args);
  } catch (error) {
    console.error(`[MessageCreate] ${label} handler failed:`, error?.stack || error?.message || error);
    return null;
  }
}

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    if (!message.guild || !message.member) return;
    if (!message.content || message.author?.bot) return;

    await runHandler('Stats', statsManager.handleMessageCreate, message);
    await runHandler('Leveling', levelingTracking.handleMessageCreate, message);

    const handledPrefixCommand = await runHandler('Prefix Command', handlePrefixCommand, message, client);
    if (handledPrefixCommand) return;

    await runHandler('Translation', translationThreadManager.handleMessageCreate, message, client);
    await runHandler('Sticky', handleStickyMessage, message, client);
  },
};
