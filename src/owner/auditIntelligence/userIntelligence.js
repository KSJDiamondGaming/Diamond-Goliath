'use strict';

const auditStore = require('./auditStore');

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function snapshotMember(member) {
  if (!member) return null;
  const user = member.user || member;
  return {
    id: user.id || member.id || null,
    username: user.username || null,
    globalName: user.globalName || null,
    displayName: member.displayName || user.globalName || user.username || null,
    bot: Boolean(user.bot),
    accountCreatedAt: iso(user.createdAt),
    joinedAt: iso(member.joinedAt),
    nickname: member.nickname || null,
    roles: member.roles?.cache
      ? member.roles.cache.filter((role) => role.id !== member.guild?.id).sort((a, b) => b.position - a.position).map((role) => ({ id: role.id, name: role.name, position: role.position }))
      : [],
    highestRole: member.roles?.highest ? { id: member.roles.highest.id, name: member.roles.highest.name, position: member.roles.highest.position } : null,
    timedOutUntil: iso(member.communicationDisabledUntil),
    pending: Boolean(member.pending),
  };
}

function snapshotUser(user) {
  if (!user) return null;
  return {
    id: user.id || null,
    username: user.username || null,
    globalName: user.globalName || null,
    bot: Boolean(user.bot),
    accountCreatedAt: iso(user.createdAt),
  };
}

async function buildReport(client, userId) {
  const stored = auditStore.getUser(userId) || { userId, eventCount: 0, guilds: {} };
  const liveGuilds = [];

  for (const guild of client?.guilds?.cache?.values?.() || []) {
    const member = guild.members.cache.get(String(userId)) || await guild.members.fetch(String(userId)).catch(() => null);
    if (!member) continue;
    liveGuilds.push({ guildId: guild.id, guildName: guild.name, member: snapshotMember(member) });
  }

  return {
    userId: String(userId),
    stored,
    liveGuilds,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { snapshotMember, snapshotUser, buildReport };
