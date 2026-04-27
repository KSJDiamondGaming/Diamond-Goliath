const { runAutomod } = require('../core/modules/automod');

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    try {
      if (!message.guild) return;
      if (!message.member) return;
      if (!message.content) return;
      if (message.author?.bot) return;

      await runAutomod(message);
    } catch (error) {
      console.error('❌ messageCreate handler failed:', error);
    }
  },
};