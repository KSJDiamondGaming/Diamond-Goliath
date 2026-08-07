'use strict';

const { AuditLogEvent } = require('discord.js');
const socialStore = require('../../modules/socialStudio/socialAlerts/socialStudioStore');

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let cleanupTimer = null;

async function detectKick(member) {
  try {
    const logs = await member.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberKick,
      limit: 6,
    });

    return logs.entries.some((entry) => {
      const createdAt = Number(entry?.createdTimestamp || 0);
      return String(entry?.target?.id || '') === String(member.user.id)
        && Date.now() - createdAt <= 15_000;
    });
  } catch {
    return false;
  }
}

function cleanupGuild(guildId) {
  return socialStore.deleteExpiredCreators(guildId, Date.now(), {
    actorId: 'system:social-studio-lifecycle',
  });
}

async function cleanupAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) cleanupGuild(guild.id);
}

module.exports = [
  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      await cleanupAllGuilds(client);
      if (cleanupTimer) clearInterval(cleanupTimer);
      cleanupTimer = setInterval(() => {
        cleanupAllGuilds(client).catch(() => null);
      }, CLEANUP_INTERVAL_MS);
      cleanupTimer.unref?.();
    },
  },
  {
    name: 'guildMemberAdd',
    async execute(member) {
      if (member.user?.bot) return;
      cleanupGuild(member.guild.id);
      socialStore.markCreatorActive(member.guild.id, member.user.id, {
        actorId: member.user.id,
      });
    },
  },
  {
    name: 'guildMemberRemove',
    async execute(member) {
      if (member.user?.bot) return;
      cleanupGuild(member.guild.id);
      const departureType = await detectKick(member) ? 'kicked' : 'left';
      socialStore.markCreatorDeparted(member.guild.id, member.user.id, departureType, {
        actorId: 'system:social-studio-lifecycle',
      });
    },
  },
  {
    name: 'guildBanAdd',
    async execute(ban) {
      if (ban.user?.bot) return;
      socialStore.deleteCreatorByOwner(ban.guild.id, ban.user.id, {
        actorId: 'system:social-studio-ban',
      });
    },
  },
];
