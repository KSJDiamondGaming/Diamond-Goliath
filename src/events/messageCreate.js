const { Events } = require('discord.js');
const { processAutomod } = require('../utils/automod/automodProcessor');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      if (!message.guild) return;
      await processAutomod(message);
    } catch (error) {
      console.error('[EVENT] messageCreate error:', error);
    }
  },
};