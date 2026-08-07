'use strict';

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../../core/guild/moduleSectionManager');

const MODULE_KEY = 'leveling';

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
      xpAwarded: 0,
      levelUps: 0,
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
      xpAwarded: Math.max(0, Number(source.analytics?.xpAwarded || 0)),
      levelUps: Math.max(0, Number(source.analytics?.levelUps || 0)),
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
  const section = getSection(guildId);
  return !section.pausedUsers?.[safeUserId];
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
  return updateSection(guildId, (section) => {
    const paused = Boolean(section.pausedUsers?.[normalized.userId]);
    if (paused) {
      return {
        ...section,
        pausedUsers: {
          ...section.pausedUsers,
          [normalized.userId]: { ...section.pausedUsers[normalized.userId], ...normalized, updatedAt: now() },
        },
        updatedAt: now(),
      };
    }
    return {
      ...section,
      users: {
        ...section.users,
        [normalized.userId]: { ...section.users?.[normalized.userId], ...normalized, updatedAt: now() },
      },
      updatedAt: now(),
    };
  }, guildOrMeta)[paused ? 'pausedUsers' : 'users'][normalized.userId];
}

function canAwardMessageXp(user, section) {
  if (!user?.lastMessageXpAt) return true;
  const last = new Date(user.lastMessageXpAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= Number(section.cooldownSeconds || 60) * 1000;
}

function awardMessageXp(guildId, userId, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId || !isUserParticipating(guildId, safeUserId)) return null;
  const section = getSection(guildId);
  const existing = section.users[safeUserId] || { userId: safeUserId, xp: 0, level: 0, messages: 0 };
  if (!canAwardMessageXp(existing, section)) return null;
  const previousLevel = Number(existing.level || 0);
  const xpAwarded = Number(section.xpPerMessage || 10);
  const nextXp = Number(existing.xp || 0) + xpAwarded;
  const nextLevel = levelForXp(nextXp);
  const user = saveUser(guildId, {
    ...existing,
    xp: nextXp,
    level: nextLevel,
    messages: Number(existing.messages || 0) + 1,
    lastMessageXpAt: now(),
  }, guildOrMeta);
  updateSection(guildId, (current) => ({
    ...current,
    analytics: {
      ...current.analytics,
      messagesTracked: Number(current.analytics.messagesTracked || 0) + 1,
      xpAwarded: Number(current.analytics.xpAwarded || 0) + xpAwarded,
      levelUps: Number(current.analytics.levelUps || 0) + (nextLevel > previousLevel ? 1 : 0),
    },
  }), guildOrMeta);
  return { user, previousLevel, newLevel: nextLevel, levelledUp: nextLevel > previousLevel, xpAwarded };
}

function getLeaderboard(guildId, limit = 10) {
  return Object.values(getSection(guildId).users)
    .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 10))));
}

module.exports = {
  MODULE_KEY,
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
  awardMessageXp,
  getLeaderboard,
};
