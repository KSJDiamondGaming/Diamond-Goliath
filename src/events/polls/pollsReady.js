'use strict';

const { Events } = require('discord.js');
const polls = require('../../modules/communityStudio/polls/polls');
const tracking = require('../../modules/communityStudio/polls/pollsTracking');
const invites = require('../../modules/communityStudio/invites/invites');

async function initialiseInviteSnapshots(client) {
  for (const guild of client.guilds.cache.values()) {
    const section = invites.getSection(guild.id);
    if (section.enabled !== true || section.settings?.trackingEnabled === false) continue;
    await invites.syncGuild(guild, {
      actorId: client.user?.id || null,
      action: 'invites_startup_sync',
    }).catch((error) => {
      console.warn(`[Invites] Startup sync failed for guild ${guild.id}: ${error.message || error}`);
    });
  }
}

module.exports = [
  {
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
      await initialiseInviteSnapshots(client);
    },
  },
  {
    name: Events.GuildMemberAdd,
    async execute(member) {
      const section = invites.getSection(member.guild.id);
      if (section.enabled !== true || section.settings?.trackingEnabled === false) return;
      await invites.trackJoin(member, {
        actorId: member.id,
        action: 'invites_member_join',
      }).catch((error) => {
        console.warn(`[Invites] Failed to track join for ${member.id}: ${error.message || error}`);
      });
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(member) {
      const section = invites.getSection(member.guild.id);
      if (section.enabled !== true || section.settings?.trackingEnabled === false) return;
      await invites.trackLeave(member, {
        actorId: member.id,
        action: 'invites_member_leave',
      }).catch((error) => {
        console.warn(`[Invites] Failed to track leave for ${member.id}: ${error.message || error}`);
      });
    },
  },
];