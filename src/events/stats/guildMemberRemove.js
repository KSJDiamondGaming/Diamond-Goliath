'use strict';

const { Events } = require('discord.js');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await statsManager.handleGuildMemberRemove(member);
  },
};
