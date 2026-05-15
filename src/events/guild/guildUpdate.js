const {
  handleGuildUpdate,
} = require('../../security/securitySystem');

module.exports = {
  name: 'guildUpdate',

  async execute(oldGuild, newGuild) {
    try {
      await handleGuildUpdate(
        oldGuild,
        newGuild
      );
    } catch (error) {
      console.error(
        '[guildUpdate] Failed to process guild update:',
        error
      );
    }
  },
};