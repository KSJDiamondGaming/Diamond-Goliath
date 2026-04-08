const handleMemberEmbed = require('../utils/handleMemberEmbed');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, _client) {
    try {
      console.log(`👋 Member joined: ${member.user.tag} in ${member.guild.name}`);

      // Trigger welcome/embed system
      await handleMemberEmbed(member, 'join');

    } catch (error) {
      console.error('Error in guildMemberAdd event:', error);
    }
  },
};