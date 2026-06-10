const { runAutomod } = require('../../modules/automod/service');
const { handleStickyMessage } = require('../../modules/sticky/stickyManager');

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    try {
      if (!message.guild || !message.member) return;
      if (!message.content || message.author?.bot) return;

      await runAutomod(message, client);
      await handleStickyMessage(message, client);
    } catch (error) {
      console.error('[EVENT: messageCreate]', error);
    }
  },
};
