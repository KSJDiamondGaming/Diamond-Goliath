'use strict';

const { Events } = require('discord.js');
const polls = require('../../modules/communityStudio/polls/polls');
const tracking = require('../../modules/communityStudio/polls/pollsTracking');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await tracking.startup(client);
    for (const guild of client.guilds.cache.values()) {
      const section = polls.getSection(guild.id);
      if (section.enabled === false) continue;
      const result = await tracking.repair(guild, {
        actorId: client.user?.id || null,
        reason: 'startup_recovery',
      });
      if (result.failed.length) {
        console.warn(`[Polls] Startup recovery failed for ${result.failed.length} poll(s) in guild ${guild.id}.`);
      }
    }
  },
};
