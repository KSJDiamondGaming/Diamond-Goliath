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
      ? member.roles.cache
        .filter((role) => role.id !== member.guild?.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, position: role.position, permissions: role.permissions?.bitfield?.toString?.() || null }))
      : [],
    highestRole: member.roles?.highest ? {
      id: member.roles.highest.id,
      name: member.roles.highest.name,
      position: member.roles.highest.position,
    } : null,
    timedOutUntil: iso(member.communicationDisabledUntil),
    pending: Boolean(member.pending),
    permissions: member.permissions?.bitfield?.toString?.() || null,
    voice: member.voice ? {
      channelId: member.voice.channelId || null,
      serverMute: Boolean(member.voice.serverMute),
      serverDeaf: Boolean(member.voice.serverDeaf),
      selfMute: Boolean(member.voice.selfMute),
      selfDeaf: Boolean(member.voice.selfDeaf),
      streaming: Boolean(member.voice.streaming),
      selfVideo: Boolean(member.voice.selfVideo),
    } : null,
  };
}

function snapshotUser(user) {
  if (!user) return null;
  return {
    id: user.id || null,
    username: user.username || null,
    globalName: user.globalName || null,
    displayName: user.globalName || user.username || null,
    bot: Boolean(user.bot),
    accountCreatedAt: iso(user.createdAt),
    avatar: user.avatar || null,
    banner: user.banner || null,
  };
}

function summariseStored(stored) {
  const guilds = Object.values(stored.guilds || {});
  const currentGuilds = guilds.filter((guild) => guild.currentMember === true);
  const formerGuilds = guilds.filter((guild) => guild.currentMember === false);
  return {
    firstObservedAt: stored.firstObservedAt || null,
    lastObservedAt: stored.lastObservedAt || null,
    eventCount: Number(stored.eventCount || 0),
    knownGuildCount: guilds.length,
    currentGuildCount: currentGuilds.length,
    formerGuildCount: formerGuilds.length,
    joinCount: (stored.joinHistory || []).length,
    leaveCount: (stored.leaveHistory || []).length,
    moderationCount: (stored.moderationHistory || []).length,
    roleChangeCount: (stored.roleHistory || []).length,
    voiceEventCount: (stored.voiceHistory || []).length,
    actorEventCount: Number(stored.relations?.actor || 0),
    subjectEventCount: Number(stored.relations?.subject || 0),
  };
}

async function buildReport(client, userId) {
  const id = String(userId);
  const stored = auditStore.getUserAcrossModes?.(id) || auditStore.getUser(id) || {
    userId: id,
    eventCount: 0,
    guilds: {},
    eventTypes: {},
    categories: {},
    relations: { subject: 0, actor: 0 },
    joinHistory: [],
    leaveHistory: [],
    roleHistory: [],
    moderationHistory: [],
    voiceHistory: [],
    actorHistory: [],
    recentEvents: [],
  };
  const liveGuilds = [];

  for (const guild of client?.guilds?.cache?.values?.() || []) {
    const member = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
    if (!member) continue;
    liveGuilds.push({
      guildId: guild.id,
      guildName: guild.name,
      member: snapshotMember(member),
    });
  }

  let liveUser = null;
  for (const item of liveGuilds) {
    const member = client.guilds.cache.get(item.guildId)?.members.cache.get(id) || null;
    if (member?.user) {
      liveUser = snapshotUser(member.user);
      break;
    }
  }
  if (!liveUser && client?.users?.fetch) {
    const fetched = await client.users.fetch(id).catch(() => null);
    if (fetched) liveUser = snapshotUser(fetched);
  }

  return {
    userId: id,
    profile: liveUser || {
      id,
      username: stored.names?.at?.(-1) || null,
      globalName: stored.globalNames?.at?.(-1) || null,
      displayName: stored.displayNames?.at?.(-1) || null,
      bot: stored.bot ?? null,
      accountCreatedAt: stored.accountCreatedAt || null,
    },
    summary: summariseStored(stored),
    currentState: {
      knownToDiscord: Boolean(liveUser),
      guilds: liveGuilds,
    },
    history: {
      names: stored.names || [],
      globalNames: stored.globalNames || [],
      displayNames: stored.displayNames || [],
      nicknames: stored.nicknames || [],
      joins: stored.joinHistory || [],
      leaves: stored.leaveHistory || [],
      roles: stored.roleHistory || [],
      moderation: stored.moderationHistory || [],
      voice: stored.voiceHistory || [],
      actions: stored.actorHistory || [],
      recentEvents: stored.recentEvents || [],
    },
    counts: {
      byEventType: stored.eventTypes || {},
      byCategory: stored.categories || {},
      byRelation: stored.relations || { subject: 0, actor: 0 },
    },
    environments: stored.environments || {},
    stored,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { snapshotMember, snapshotUser, buildReport };
