'use strict';

const { AuditLogEvent } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const socialStudio = require('../../modules/socialStudio/socialAlerts/socialStudio');

const CREATOR_GRACE_PERIOD_MS = 5 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let cleanupTimer = null;

function getSocialSection(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {});
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function saveSocialSection(guildId, section, actorId = null) {
  guildManager.saveGuildSection(guildId, 'social', section, { guildId, actorId });
}

function findCreator(section, ownerDiscordId) {
  const creators = section.creators && typeof section.creators === 'object' && !Array.isArray(section.creators)
    ? section.creators
    : {};
  return Object.values(creators)
    .find((creator) => String(creator?.ownerDiscordId || '') === String(ownerDiscordId)) || null;
}

function restoreCreator(guildId, ownerDiscordId) {
  const creator = socialStudio.markMemberActive(guildId, ownerDiscordId);
  if (!creator) return null;

  const section = getSocialSection(guildId);
  const stored = findCreator(section, ownerDiscordId);
  if (!stored) return creator;

  stored.status = 'active';
  stored.departureType = null;
  stored.leftAt = null;
  stored.scheduledDeletionAt = null;
  stored.updatedAt = new Date().toISOString();
  saveSocialSection(guildId, section, ownerDiscordId);
  return stored;
}

function scheduleCreatorDeletion(guildId, ownerDiscordId, departureType) {
  const section = getSocialSection(guildId);
  const creator = findCreator(section, ownerDiscordId);
  if (!creator) return null;

  const timestamp = Date.now();
  creator.status = departureType === 'kicked' ? 'kicked' : 'left_server';
  creator.departureType = departureType === 'kicked' ? 'kicked' : 'left';
  creator.leftAt = new Date(timestamp).toISOString();
  creator.scheduledDeletionAt = new Date(timestamp + CREATOR_GRACE_PERIOD_MS).toISOString();
  creator.updatedAt = new Date(timestamp).toISOString();
  saveSocialSection(guildId, section);
  return creator;
}

function cleanupExpiredCreators(guildId) {
  const section = getSocialSection(guildId);
  const creators = section.creators && typeof section.creators === 'object' && !Array.isArray(section.creators)
    ? Object.values(section.creators)
    : [];
  const now = Date.now();
  let deleted = 0;

  for (const creator of creators) {
    if (!['left_server', 'kicked'].includes(String(creator?.status || ''))) continue;
    const deletionAt = new Date(creator?.scheduledDeletionAt || '').getTime();
    if (!Number.isFinite(deletionAt) || deletionAt > now) continue;
    if (socialStudio.deleteCreatorOwnedData(guildId, creator.ownerDiscordId)) deleted += 1;
  }

  return deleted;
}

async function detectKick(member) {
  try {
    const logs = await member.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberKick,
      limit: 6,
    });
    const entry = logs.entries.find((item) => {
      const createdAt = Number(item?.createdTimestamp || 0);
      return String(item?.target?.id || '') === String(member.user.id)
        && Date.now() - createdAt <= 15_000;
    });
    return Boolean(entry);
  } catch {
    return false;
  }
}

async function cleanupAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    cleanupExpiredCreators(guild.id);
  }
}

module.exports = [
  {
    name: 'ready',
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
      cleanupExpiredCreators(member.guild.id);
      restoreCreator(member.guild.id, member.user.id);
    },
  },
  {
    name: 'guildMemberRemove',
    async execute(member) {
      if (member.user?.bot) return;
      cleanupExpiredCreators(member.guild.id);
      const kicked = await detectKick(member);
      scheduleCreatorDeletion(member.guild.id, member.user.id, kicked ? 'kicked' : 'left');
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
