'use strict';

const guildManager = require('../../../core/guild/guildManager');

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
    enabled: true,
    announceChannelId: null,
    managerRoleIds: [],
    levelRoleIds: [],
    trackMessages: true,
    trackVoice: true,
    announceLevelUps: true,
    xpPerMessage: 10,
    cooldownSeconds: 60,
    users: {},
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

function normalize(section = {}) {
  const base = defaults();
  const source = section && typeof section === 'object' ? section : {};
  const users = source.users && typeof source.users === 'object' ? source.users : {};
  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    announceChannelId: cleanDiscordId(source.announceChannelId),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    levelRoleIds: cleanIdArray(source.levelRoleIds),
    trackMessages: source.trackMessages !== false,
    trackVoice: source.trackVoice !== false,
    announceLevelUps: source.announceLevelUps !== false,
    xpPerMessage: Math.max(1, Math.min(1000, Number(source.xpPerMessage || 10))),
    cooldownSeconds: Math.max(0, Math.min(3600, Number(source.cooldownSeconds ?? 60))),
    users: Object.fromEntries(Object.entries(users)
      .map(([id, user]) => normalizeUser({ ...user, userId: user.userId || id }))
      .filter((user) => user.userId)
      .map((user) => [user.userId, user])),
    analytics: {
      messagesTracked: Math.max(0, Number(source.analytics?.messagesTracked || 0)),
      xpAwarded: Math.max(0, Number(source.analytics?.xpAwarded || 0)),
      levelUps: Math.max(0, Number(source.analytics?.levelUps || 0)),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getSection(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return normalize(modules?.[MODULE_KEY] || defaults());
}

function saveSection(guildId, section, guildOrMeta = {}) {
  const normalized = normalize(section);
  guildManager.updateGuildSection(guildId, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    [MODULE_KEY]: normalized,
  }), {}, guildOrMeta);
  return normalized;
}

function updateSection(guildId, updater, guildOrMeta = {}) {
  const current = getSection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveSection(guildId, normalize(next), guildOrMeta);
}

function getUser(guildId, userId) {
  return getSection(guildId).users?.[cleanDiscordId(userId)] || null;
}

function saveUser(guildId, user, guildOrMeta = {}) {
  const normalized = normalizeUser(user);
  if (!normalized.userId) throw new Error('A valid user is required.');
  return updateSection(guildId, (section) => ({
    ...section,
    users: {
      ...section.users,
      [normalized.userId]: { ...section.users?.[normalized.userId], ...normalized, updatedAt: now() },
    },
    updatedAt: now(),
  }), guildOrMeta).users[normalized.userId];
}

function canAwardMessageXp(user, section) {
  if (!user?.lastMessageXpAt) return true;
  const last = new Date(user.lastMessageXpAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= Number(section.cooldownSeconds || 60) * 1000;
}

function awardMessageXp(guildId, userId, guildOrMeta = {}) {
  const section = getSection(guildId);
  const existing = getUser(guildId, userId) || { userId, xp: 0, level: 0, messages: 0 };
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
  xpForLevel,
  levelForXp,
  canAwardMessageXp,
  awardMessageXp,
  getLeaderboard,
};
