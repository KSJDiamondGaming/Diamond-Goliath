'use strict';

const { handleReactionAdd } = require('../../modules/roleStudio/reactionRoles/reactionRoles');
const { enterGiveawayReaction } = require('../../modules/communityStudio/giveaways/giveawaysManager');
const { handleStarReactionAdd } = require('../../modules/messageStudio/starboard/starboard');
const { isModuleEnabled } = require('../../core/guild/guildManager');

async function getReactionGuildId(reaction) {
  if (reaction?.partial) await reaction.fetch().catch(() => null);
  if (reaction?.message?.partial) await reaction.message.fetch().catch(() => null);
  return reaction?.message?.guild?.id || null;
}

async function runHandler(label, handler) {
  try {
    await handler();
  } catch (error) {
    console.error(`[EVENT: messageReactionAdd] ${label} failed:`, error);
  }
}

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    const guildId = await getReactionGuildId(reaction).catch((error) => {
      console.error('[EVENT: messageReactionAdd] Failed to resolve guild:', error);
      return null;
    });

    await runHandler('Reaction Roles', () => handleReactionAdd(reaction, user, client));
    if (!guildId) return;

    if (isModuleEnabled(guildId, 'giveaways')) {
      await runHandler('Giveaways', () => enterGiveawayReaction(reaction, user));
    }
    if (isModuleEnabled(guildId, 'starboard')) {
      await runHandler('Starboard', () => handleStarReactionAdd(reaction, user));
    }
  },
};