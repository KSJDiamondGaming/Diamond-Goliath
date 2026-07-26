'use strict';

const { handleReactionRemove } = require('../../modules/roleStudio/reactionRoles/reactionRoles');
const { leaveGiveawayReaction } = require('../../modules/communityStudio/giveaways/giveawaysManager');
const { handleStarReactionRemove } = require('../../modules/messageStudio/starboard/starboard');
const { isModuleEnabled } = require('../../core/guild/guildManager');

async function getReactionGuildId(reaction) {
  if (reaction?.partial) await reaction.fetch().catch(() => null);
  if (reaction?.message?.partial) await reaction.message.fetch().catch(() => null);
  return reaction?.message?.guild?.id || null;
}

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client) {
    try {
      const guildId = await getReactionGuildId(reaction);
      await handleReactionRemove(reaction, user, client);
      if (isModuleEnabled(guildId, 'giveaways')) await leaveGiveawayReaction(reaction, user);
      if (isModuleEnabled(guildId, 'starboard')) await handleStarReactionRemove(reaction, user);
    } catch (error) {
      console.error('[EVENT: messageReactionRemove]', error);
    }
  },
};
