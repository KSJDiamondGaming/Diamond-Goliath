'use strict';

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../../core/guild/moduleSectionManager');

const MODULE_KEY = 'leveling';
const XP_SOURCES = Object.freeze({
  MESSAGE: 'message',
  VOICE: 'voice',
  MANUAL: 'manual',
  EVENT: 'event',
  QUEST: 'quest',
  OTHER: 'other',
});

const now = () => new Date().toISOString();

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function defaults() {
  return {
    announceChannelId: null,
    managerRoleIds: [],
    levelRoleIds: [],
    trackMessages: true,
    trackVoice: true,
    announceLevelUps: true,
    xpPerMessage: 10,
    cooldownSeconds: 60,
    users: {},
    pausedUsers: {},
    analytics: {
      messagesTracked: 0,
      voiceMinutesTracked: 0,
      xpAwarded: 0,
      levelUps: 0,
      xpBySource: {},
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function xpForLevel(level) {
  const safeLevel = Math.max(0, Number(level || 0));
  return safeLevel * safeLevel * 100;
}

function levelForXp(xp) {
  const safeXp = Math.max(0, Number(xp || 0));
  return Math.floor(Math.sqrt(safeXp / 100));
}

function normalizeUser(input = {}) {
  const userId = cleanDiscordId(input.userId || input.id);
  const xp = Math.max(0, Number(input.xp || 0));
  return {
    userId,
    id: userId,
    xp,
    level: Math.max(0, Number(input.level ?? levelForXp(xp))),
    messages: Math.max(0, Number(input.messages || 0)),
    voiceMinutes: Math.max(0, Number(input.voiceMinutes || 0)),
    lastMessageXpAt: input.lastMessageXpAt || null,
    lastVoiceXpAt: input.lastVoiceXpAt || null,
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || input.createdAt || now(),
  };
}

function normalizeUsers(value) {
  const users = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(users)
    .map(([id, user]) => normalizeUser({ ...user, userId: user.userId || id }))
    .filter((user) => user.userId)
    .map((user) => [user.userId, user]));
}

function normalizeSourceAnalytics(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(source)
    .map(([key, amount]) => [String(key), Math.max(0, Number(amount || 0))]));
}

function normalize(section = {}) {
  const base = defaults();
  const source = section && typeof section === 'object' ? section : {};
  const normalized = {
    ...base,
    ...source,
    announceChannelId: cleanDiscordId(source.announceChannelId),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    levelRoleIds: cleanIdArray(source.levelRoleIds),
    trackMessages: source.trackMessages !== false,
    trackVoice: source.trackVoice !== false,
    announceLevelUps: source.announceLevelUps !== false,
    xpPerMessage: Math.max(1, Math.min(1000, Number(source.xpPerMessage || 10))),
    cooldownSeconds: Math.max(0, Math.min(3600, Number(source.cooldownSeconds ?? 60))),
    users: normalizeUsers(source.users),
    pausedUsers: normalizeUsers(source.pausedUsers),
    analytics: {
      messagesTracked: Math.max(0, Number(source.analytics?.messagesTracked || 0)),
      voiceMinutesTracked: Math.max(0, Number(source.analytics?.voiceMinutesTracked || 0)),
      xpAwarded: Math.max(0, Number(source.analytics?.xpAwarded || 0)),
      levelUps: Math.max(0, Number(source.analytics?.levelUps || 0)),
      xpBySource: normalizeSourceAnalytics(source.analytics?.xpBySource),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
  delete normalized.enabled;
  return normalized;
}

function getSection(guildId) {
  return normalize(getModuleSection(guildId, MODULE_KEY, defaults()));
}

function saveSection(guildId, section, guildOrMeta = {}) {
  return normalize(saveModuleSection(guildId, MODULE_KEY, normalize(section), guildOrMeta));
}

function updateSection(guildId, updater, guildOrMeta = {}) {
  return normalize(updateModuleSection(
    guildId,
    MODULE_KEY,
    (current) => {
      const normalized = normalize(current);
      const next = typeof updater === 'function' ? updater(normalized) : updater;
      return normalize(next);
    },
    defaults(),
    guildOrMeta,
  ));
}

function getUser(guildId, userId) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId) return null;
  const section = getSection(guildId);
  return section.users?.[safeUserId] || section.pausedUsers?.[safeUserId] || null;
}

function isUserParticipating(guildId, userId) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId) return false;
  return !getSection(guildId).pausedUsers?.[safeUserId];
}

function setUserParticipation(guildId, userId, participating, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId) throw new Error('A valid user is required.');
  const enabled = participating !== false;

  const section = updateSection(guildId, (current) => {
    const users = { ...current.users };
    const pausedUsers = { ...current.pausedUsers };
    const existing = users[safeUserId] || pausedUsers[safeUserId] || normalizeUser({ userId: safeUserId });
    const preserved = normalizeUser({ ...existing, userId: safeUserId, updatedAt: now() });

    if (enabled) {
      users[safeUserId] = preserved;
      delete pausedUsers[safeUserId];
    } else {
      pausedUsers[safeUserId] = preserved;
      delete users[safeUserId];
    }

    return { ...current, users, pausedUsers, updatedAt: now() };
  }, guildOrMeta);

  return {
    participating: enabled,
    user: enabled ? section.users[safeUserId] : section.pausedUsers[safeUserId],
  };
}

function saveUser(guildId, user, guildOrMeta = {}) {
  const normalized = normalizeUser(user);
  if (!normalized.userId) throw new Error('A valid user is required.');
  const paused = !isUserParticipating(guildId, normalized.userId);
  const section = updateSection(guildId, (current) => {
    const bucket = paused ? 'pausedUsers' : 'users';
    return {
      ...current,
      [bucket]: {
        ...current[bucket],
        [normalized.userId]: { ...current[bucket]?.[normalized.userId], ...normalized, updatedAt: now() },
      },
      updatedAt: now(),
    };
  }, guildOrMeta);
  return (paused ? section.pausedUsers : section.users)[normalized.userId];
}

function canAwardMessageXp(user, section) {
  if (!user?.lastMessageXpAt) return true;
  const last = new Date(user.lastMessageXpAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= Number(section.cooldownSeconds || 60) * 1000;
}

function normalizeXpSource(value) {
  const source = String(value || XP_SOURCES.OTHER).trim().toLowerCase();
  return source || XP_SOURCES.OTHER;
}

function awardXp(guildId, userId, amount, options = {}, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  const xpAwarded = Math.max(0, Number(amount || 0));
  if (!safeUserId || xpAwarded <= 0) return null;

  // This is the single authoritative opt-out guard for every XP source.
  if (!isUserParticipating(guildId, safeUserId)) return null;

  const section = getSection(guildId);
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  const previousLevel = Number(existing.level || 0);
  const nextXp = Number(existing.xp || 0) + xpAwarded;
  const nextLevel = levelForXp(nextXp);
  const source = normalizeXpSource(options.source);
  const activity = options.activity && typeof options.activity === 'object' ? options.activity : {};

  const user = saveUser(guildId, {
    ...existing,
    ...activity,
    xp: nextXp,
    level: nextLevel,
  }, guildOrMeta);

  updateSection(guildId, (current) => ({
    ...current,
    analytics: {
      ...current.analytics,
      messagesTracked: Number(current.analytics.messagesTracked || 0) + Math.max(0, Number(options.messagesTracked || 0)),
      voiceMinutesTracked: Number(current.analytics.voiceMinutesTracked || 0) + Math.max(0, Number(options.voiceMinutesTracked || 0)),
      xpAwarded: Number(current.analytics.xpAwarded || 0) + xpAwarded,
      levelUps: Number(current.analytics.levelUps || 0) + (nextLevel > previousLevel ? 1 : 0),
      xpBySource: {
        ...current.analytics.xpBySource,
        [source]: Number(current.analytics.xpBySource?.[source] || 0) + xpAwarded,
      },
    },
    updatedAt: now(),
  }), guildOrMeta);

  return {
    user,
    source,
    previousLevel,
    newLevel: nextLevel,
    levelledUp: nextLevel > previousLevel,
    xpAwarded,
  };
}

function awardMessageXp(guildId, userId, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId || !isUserParticipating(guildId, safeUserId)) return null;
  const section = getSection(guildId);
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  if (!canAwardMessageXp(existing, section)) return null;

  return awardXp(guildId, safeUserId, section.xpPerMessage, {
    source: XP_SOURCES.MESSAGE,
    messagesTracked: 1,
    activity: {
      messages: Number(existing.messages || 0) + 1,
      lastMessageXpAt: now(),
    },
  }, guildOrMeta);
}

function awardVoiceXp(guildId, userId, amount, voiceMinutes = 0, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId || !isUserParticipating(guildId, safeUserId)) return null;
  const section = getSection(guildId);
  if (section.trackVoice === false) return null;
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  const minutes = Math.max(0, Number(voiceMinutes || 0));

  return awardXp(guildId, safeUserId, amount, {
    source: XP_SOURCES.VOICE,
    voiceMinutesTracked: minutes,
    activity: {
      voiceMinutes: Number(existing.voiceMinutes || 0) + minutes,
      lastVoiceXpAt: now(),
    },
  }, guildOrMeta);
}

function getLeaderboard(guildId, limit = 10) {
  return Object.values(getSection(guildId).users)
    .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 10))));
}

module.exports = {
  MODULE_KEY,
  XP_SOURCES,
  defaults,
  normalize,
  normalizeUser,
  getSection,
  saveSection,
  updateSection,
  getUser,
  saveUser,
  isUserParticipating,
  setUserParticipation,
  xpForLevel,
  levelForXp,
  canAwardMessageXp,
  awardXp,
  awardMessageXp,
  awardVoiceXp,
  getLeaderboard,
};
