'use strict';

const { Events } = require('discord.js');
const statsManager = require('../../modules/stats/statsManager');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await statsManager.handleGuildMemberAdd(member);
  },
};
