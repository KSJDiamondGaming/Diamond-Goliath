const { runAutomod } = require('../modules/automod/service');

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    try {
      if (!message.guild || !message.member) return;
      if (!message.content || message.author?.bot) return;

      await runAutomod(message, client);
    } catch (error) {
      console.error('[EVENT: messageCreate]', error);
    }
  },
};