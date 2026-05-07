const antiNukeManager = require('../../security/antiNukeManager');

module.exports = {
  name: 'channelDelete',

  /**
   * @param {import('discord.js').GuildChannel} channel
   */
  async execute(channel) {
    try {
      if (!channel?.guild) return;

      await antiNukeManager.handleChannelDelete(channel);
    } catch (err) {
      console.error('[Event: channelDelete] Error:', err);
    }
  },
};