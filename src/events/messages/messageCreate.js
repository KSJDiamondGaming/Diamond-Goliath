'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');
const guildManager = require('../../core/guild/guildManager');
const { handleAutoMod } = require('../../core/administration/automod/events');

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
    if (!message.guild || !message.member || message.author?.bot) return;

    const autoModHandled = await runHandler('AutoMod', handleAutoMod, message);
    if (autoModHandled) return;

    await runHandler('Stats', statsManager.handleMessageCreate, message);
    await runHandler('Leveling', levelingTracking.handleMessageCreate, message);

    if (message.content && guildManager.isModuleEnabled(message.guild.id, 'translation')) {
      await runHandler('Translation', translationThreadManager.handleMessageCreate, message, client);
    }

    await runHandler('Sticky', handleStickyMessage, message, client);
  },
};
