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

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    try {
      const guildId = await getReactionGuildId(reaction);
      await handleReactionAdd(reaction, user, client);
      if (isModuleEnabled(guildId, 'giveaways')) await enterGiveawayReaction(reaction, user);
      if (isModuleEnabled(guildId, 'starboard')) await handleStarReactionAdd(reaction, user);
    } catch (error) {
      console.error('[EVENT: messageReactionAdd]', error);
    }
  },
};
