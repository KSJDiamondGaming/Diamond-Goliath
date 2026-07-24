'use strict';

const { Events } = require('discord.js');
const polls = require('../../modules/polls/polls');
const pollsManager = require('../../modules/polls/pollsManager');
const pollsHealth = require('../../modules/polls/pollsHealth');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await polls.startup(client);

    for (const guild of client.guilds.cache.values()) {
      const section = pollsManager.getSection(guild.id);
      if (section.enabled === false) continue;
      const result = await pollsHealth.repair(guild, {
        actorId: client.user?.id || null,
        reason: 'startup_recovery',
      });
      if (result.failed.length) {
        console.warn(`[Polls] Startup recovery failed for ${result.failed.length} poll(s) in guild ${guild.id}.`);
      }
    }
  },
};