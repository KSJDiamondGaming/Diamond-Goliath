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

function defaultXpSources() {
  return {
    message: {
      enabled: true,
      amount: 10,
      cooldownSeconds: 60,
      label: 'Messages',
      description: 'Earn XP for eligible server messages.',
    },
    voice: {
      enabled: true,
      amount: 5,
      intervalMinutes: 10,
      label: 'Voice Activity',
      description: 'Earn XP for eligible time spent in voice channels.',
    },
    manual: {
      enabled: true,
      amount: 0,
      label: 'Manual Awards',
      description: 'XP granted manually by server management.',
    },
    event: {
      enabled: true,
      amount: 0,
      label: 'Events',
      description: 'XP awarded through server events.',
    },
    quest: {
      enabled: true,
      amount: 0,
      label: 'Quests',
      description: 'XP awarded for configured quests and challenges.',
    },
    other: {
      enabled: true,
      amount: 0,
      label: 'Other',
      description: 'Other approved XP sources.',
    },
  };
}

function defaults() {
  return {
    announceChannelId: null,
    managerRoleIds: [],
    levelRoleIds: [],
    levelRewards: [],
    removePreviousLevelRoles: false,
    trackMessages: true,
    trackVoice: true,
    announceLevelUps: true,
    xpPerMessage: 10,
    cooldownSeconds: 60,
    xpSources: defaultXpSources(),
    multiplier: {
      enabled: false,
      name: null,
      value: 1,
      sourceIds: [],
      startsAt: null,
      endsAt: null,
    },
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
    lastXpAt: input.lastXpAt || null,
    lastXpSource: input.lastXpSource || null,
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

function normalizeXpSourceConfig(key, input = {}, fallback = {}) {
  return {
    enabled: input.enabled !== false,
    amount: Math.max(0, Math.min(100000, Number(input.amount ?? fallback.amount ?? 0))),
    cooldownSeconds: Math.max(0, Math.min(86400, Number(input.cooldownSeconds ?? fallback.cooldownSeconds ?? 0))),
    intervalMinutes: Math.max(1, Math.min(1440, Number(input.intervalMinutes ?? fallback.intervalMinutes ?? 10))),
    label: String(input.label || fallback.label || key).slice(0, 80),
    description: String(input.description || fallback.description || '').slice(0, 300),
  };
}

function normalizeXpSources(value, legacy = {}) {
  const defaultsBySource = defaultXpSources();
  const source = value && typeof value === 'object' ? value : {};
  const merged = {};

  for (const [key, fallback] of Object.entries(defaultsBySource)) {
    const override = source[key] && typeof source[key] === 'object' ? source[key] : {};
    merged[key] = normalizeXpSourceConfig(key, override, fallback);
  }

  merged.message.enabled = legacy.trackMessages !== false && merged.message.enabled !== false;
  merged.message.amount = Math.max(1, Number(legacy.xpPerMessage ?? merged.message.amount ?? 10));
  merged.message.cooldownSeconds = Math.max(0, Number(legacy.cooldownSeconds ?? merged.message.cooldownSeconds ?? 60));
  merged.voice.enabled = legacy.trackVoice !== false && merged.voice.enabled !== false;

  for (const [key, config] of Object.entries(source)) {
    if (merged[key]) continue;
    merged[key] = normalizeXpSourceConfig(key, config, {
      amount: 0,
      label: key,
      description: 'Custom XP source.',
    });
  }

  return merged;
}

function normalizeMultiplier(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const startsAt = source.startsAt ? new Date(source.startsAt).toISOString() : null;
  const endsAt = source.endsAt ? new Date(source.endsAt).toISOString() : null;
  return {
    enabled: source.enabled === true,
    name: source.name ? String(source.name).slice(0, 100) : null,
    value: Math.max(1, Math.min(100, Number(source.value || 1))),
    sourceIds: Array.isArray(source.sourceIds) ? [...new Set(source.sourceIds.map(String).filter(Boolean))] : [],
    startsAt,
    endsAt,
  };
}

function normalizeLevelRewards(value, legacyRoleIds = []) {
  const rewards = Array.isArray(value) ? value : [];
  const normalized = rewards
    .map((reward) => ({
      level: Math.max(1, Math.min(100000, Number(reward?.level || 0))),
      roleId: cleanDiscordId(reward?.roleId),
      label: reward?.label ? String(reward.label).slice(0, 100) : null,
    }))
    .filter((reward) => reward.roleId && reward.level > 0);

  if (!normalized.length && Array.isArray(legacyRoleIds)) {
    return legacyRoleIds
      .map((roleId, index) => ({ level: index + 1, roleId: cleanDiscordId(roleId), label: null }))
      .filter((reward) => reward.roleId);
  }

  return normalized.sort((a, b) => a.level - b.level || a.roleId.localeCompare(b.roleId));
}

function normalize(section = {}) {
  const base = defaults();
  const source = section && typeof section === 'object' ? section : {};
  const xpSources = normalizeXpSources(source.xpSources, source);
  const levelRewards = normalizeLevelRewards(source.levelRewards, source.levelRoleIds);
  const normalized = {
    ...base,
    ...source,
    announceChannelId: cleanDiscordId(source.announceChannelId),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    levelRoleIds: levelRewards.map((reward) => reward.roleId),
    levelRewards,
    removePreviousLevelRoles: source.removePreviousLevelRoles === true,
    trackMessages: xpSources.message.enabled !== false,
    trackVoice: xpSources.voice.enabled !== false,
    announceLevelUps: source.announceLevelUps !== false,
    xpPerMessage: xpSources.message.amount,
    cooldownSeconds: xpSources.message.cooldownSeconds,
    xpSources,
    multiplier: normalizeMultiplier(source.multiplier),
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
  return Date.now() - last >= Number(section.xpSources?.message?.cooldownSeconds || section.cooldownSeconds || 60) * 1000;
}

function normalizeXpSource(value) {
  const source = String(value || XP_SOURCES.OTHER).trim().toLowerCase();
  return source || XP_SOURCES.OTHER;
}

function isMultiplierActive(multiplier, at = Date.now()) {
  if (!multiplier?.enabled || Number(multiplier.value || 1) <= 1) return false;
  const starts = multiplier.startsAt ? new Date(multiplier.startsAt).getTime() : null;
  const ends = multiplier.endsAt ? new Date(multiplier.endsAt).getTime() : null;
  if (Number.isFinite(starts) && at < starts) return false;
  if (Number.isFinite(ends) && at >= ends) return false;
  return true;
}

function getActiveMultiplier(guildId, sourceId = null, at = Date.now()) {
  const multiplier = getSection(guildId).multiplier;
  if (!isMultiplierActive(multiplier, at)) return null;
  const appliesToAll = !Array.isArray(multiplier.sourceIds) || multiplier.sourceIds.length === 0;
  if (!appliesToAll && sourceId && !multiplier.sourceIds.includes(String(sourceId))) return null;
  return multiplier;
}

function getXpSource(guildId, sourceId) {
  const key = normalizeXpSource(sourceId);
  return getSection(guildId).xpSources?.[key] || null;
}

function setXpSource(guildId, sourceId, patch = {}, guildOrMeta = {}) {
  const key = normalizeXpSource(sourceId);
  return updateSection(guildId, (section) => ({
    ...section,
    xpSources: {
      ...section.xpSources,
      [key]: normalizeXpSourceConfig(key, { ...section.xpSources?.[key], ...patch }, section.xpSources?.[key]),
    },
    updatedAt: now(),
  }), guildOrMeta).xpSources[key];
}

function setMultiplier(guildId, multiplier, guildOrMeta = {}) {
  return updateSection(guildId, (section) => ({
    ...section,
    multiplier: normalizeMultiplier(multiplier),
    updatedAt: now(),
  }), guildOrMeta).multiplier;
}

function clearMultiplier(guildId, guildOrMeta = {}) {
  return setMultiplier(guildId, defaults().multiplier, guildOrMeta);
}

function awardXp(guildId, userId, amount, options = {}, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  const source = normalizeXpSource(options.source);
  const sourceConfig = getXpSource(guildId, source);
  const requestedAmount = Number(amount ?? sourceConfig?.amount ?? 0);
  const baseAmount = Math.max(0, requestedAmount);
  if (!safeUserId || baseAmount <= 0) return null;
  if (sourceConfig && sourceConfig.enabled === false) return null;
  if (!isUserParticipating(guildId, safeUserId)) return null;

  const multiplier = getActiveMultiplier(guildId, source);
  const multiplierValue = multiplier ? Number(multiplier.value || 1) : 1;
  const xpAwarded = Math.max(0, Math.round(baseAmount * multiplierValue));
  if (xpAwarded <= 0) return null;

  const section = getSection(guildId);
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  const previousLevel = Number(existing.level || 0);
  const nextXp = Number(existing.xp || 0) + xpAwarded;
  const nextLevel = levelForXp(nextXp);
  const activity = options.activity && typeof options.activity === 'object' ? options.activity : {};

  const user = saveUser(guildId, {
    ...existing,
    ...activity,
    xp: nextXp,
    level: nextLevel,
    lastXpAt: now(),
    lastXpSource: source,
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
    baseAmount,
    multiplier: multiplierValue,
    multiplierName: multiplier?.name || null,
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
  const sourceConfig = section.xpSources.message;
  if (sourceConfig.enabled === false) return null;
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  if (!canAwardMessageXp(existing, section)) return null;

  return awardXp(guildId, safeUserId, sourceConfig.amount, {
    source: XP_SOURCES.MESSAGE,
    messagesTracked: 1,
    activity: {
      messages: Number(existing.messages || 0) + 1,
      lastMessageXpAt: now(),
    },
  }, guildOrMeta);
}

function awardVoiceXp(guildId, userId, amount = null, voiceMinutes = 0, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId || !isUserParticipating(guildId, safeUserId)) return null;
  const section = getSection(guildId);
  const sourceConfig = section.xpSources.voice;
  if (sourceConfig.enabled === false) return null;
  const existing = section.users[safeUserId] || normalizeUser({ userId: safeUserId });
  const minutes = Math.max(0, Number(voiceMinutes || 0));

  return awardXp(guildId, safeUserId, amount ?? sourceConfig.amount, {
    source: XP_SOURCES.VOICE,
    voiceMinutesTracked: minutes,
    activity: {
      voiceMinutes: Number(existing.voiceMinutes || 0) + minutes,
      lastVoiceXpAt: now(),
    },
  }, guildOrMeta);
}

function getLeaderboard(guildId, limit = 10, options = {}) {
  const section = getSection(guildId);
  const includePaused = options.includePaused === true;
  const records = [
    ...Object.values(section.users || {}).map((user) => ({ ...user, participating: true })),
    ...(includePaused ? Object.values(section.pausedUsers || {}).map((user) => ({ ...user, participating: false })) : []),
  ];
  const sortBy = String(options.sortBy || 'xp');
  const sorter = sortBy === 'messages'
    ? (a, b) => Number(b.messages || 0) - Number(a.messages || 0)
    : sortBy === 'voice'
      ? (a, b) => Number(b.voiceMinutes || 0) - Number(a.voiceMinutes || 0)
      : sortBy === 'level'
        ? (a, b) => Number(b.level || 0) - Number(a.level || 0) || Number(b.xp || 0) - Number(a.xp || 0)
        : (a, b) => Number(b.xp || 0) - Number(a.xp || 0);
  return records.sort(sorter).slice(0, Math.max(1, Math.min(500, Number(limit || 10))));
}

function getEligibleUsers(guildId, options = {}) {
  const minLevel = Math.max(0, Number(options.minLevel || 0));
  const minXp = Math.max(0, Number(options.minXp || 0));
  const top = options.top ? Math.max(1, Math.min(500, Number(options.top))) : null;
  const includePaused = options.includePaused === true;
  const excludeUserIds = new Set((options.excludeUserIds || []).map(String));

  let users = getLeaderboard(guildId, 500, { includePaused, sortBy: options.sortBy || 'xp' })
    .filter((user) => Number(user.level || 0) >= minLevel)
    .filter((user) => Number(user.xp || 0) >= minXp)
    .filter((user) => !excludeUserIds.has(String(user.userId)));

  if (top) users = users.slice(0, top);
  return users;
}

function getLevelRewards(guildId) {
  return getSection(guildId).levelRewards;
}

function setLevelRewards(guildId, rewards, guildOrMeta = {}) {
  return updateSection(guildId, (section) => {
    const normalizedRewards = normalizeLevelRewards(rewards, []);
    return {
      ...section,
      levelRewards: normalizedRewards,
      levelRoleIds: normalizedRewards.map((reward) => reward.roleId),
      updatedAt: now(),
    };
  }, guildOrMeta).levelRewards;
}

function getRewardForLevel(guildId, level) {
  const currentLevel = Math.max(0, Number(level || 0));
  return getLevelRewards(guildId)
    .filter((reward) => reward.level <= currentLevel)
    .sort((a, b) => b.level - a.level)[0] || null;
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
  getXpSource,
  setXpSource,
  getActiveMultiplier,
  setMultiplier,
  clearMultiplier,
  awardXp,
  awardMessageXp,
  awardVoiceXp,
  getLeaderboard,
  getEligibleUsers,
  getLevelRewards,
  setLevelRewards,
  getRewardForLevel,
};
