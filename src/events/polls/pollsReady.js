'use strict';

const { Events } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const pollsTracking = require('../../modules/communityStudio/polls/pollsTracking');
const invitesTracking = require('../../modules/communityStudio/invites/invitesTracking');

async function runPollStartupRecovery(client) {
  await pollsTracking.startup(client);

  for (const guild of client.guilds.cache.values()) {
    if (!guildManager.isModuleEnabled(guild.id, 'polls')) continue;

    const result = await pollsTracking.repair(guild, {
      actorId: client.user?.id || null,
      reason: 'startup_recovery',
    });

    if (result.failed.length) {
      console.warn(`[Polls] Startup recovery failed for ${result.failed.length} poll(s) in guild ${guild.id}.`);
    }
  }
}

async function trackInviteJoin(member) {
  if (!guildManager.isModuleEnabled(member.guild.id, 'invites')) return;

  await invitesTracking.trackJoin(member, {
    actorId: member.id,
    action: 'invites_member_join',
  }).catch((error) => {
    console.warn(`[Invites] Failed to track join for ${member.id}: ${error.message || error}`);
  });
}

async function trackInviteLeave(member) {
  if (!guildManager.isModuleEnabled(member.guild.id, 'invites')) return;

  await invitesTracking.trackLeave(member, {
    actorId: member.id,
    action: 'invites_member_leave',
  }).catch((error) => {
    console.warn(`[Invites] Failed to track leave for ${member.id}: ${error.message || error}`);
  });
}

module.exports = [
  {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
      await runPollStartupRecovery(client);
      await invitesTracking.startup(client);
    },
  },
  {
    name: Events.GuildMemberAdd,
    async execute(member) {
      await trackInviteJoin(member);
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(member) {
      await trackInviteLeave(member);
    },
  },
];
