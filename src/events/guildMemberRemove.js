const handleMemberEmbed = require('../utils/handleMemberEmbed');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      console.log(`👋 Member left: ${member.user.tag} from ${member.guild.name}`);

      // Trigger leave/embed system
      await handleMemberEmbed(member, 'leave');

    } catch (error) {
      console.error('Error in guildMemberRemove event:', error);
    }
  },
};