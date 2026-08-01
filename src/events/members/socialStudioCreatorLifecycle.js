'use strict';

const socialStudio = require('../../modules/socialStudio/socialStudioUserService');

module.exports = [
  {
    name: 'guildMemberAdd',
    async execute(member) {
      if (member.user?.bot) return;
      socialStudio.markMemberActive(member.guild.id, member.user.id);
    },
  },
  {
    name: 'guildMemberRemove',
    async execute(member) {
      if (member.user?.bot) return;
      socialStudio.markMemberLeft(member.guild.id, member.user.id);
    },
  },
  {
    name: 'guildBanAdd',
    async execute(ban) {
      if (ban.user?.bot) return;
      socialStudio.deleteCreatorOwnedData(ban.guild.id, ban.user.id);
    },
  },
];
