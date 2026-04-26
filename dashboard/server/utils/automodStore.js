const guildManager = require('../../../dashboard/server/utils/guildManager');

/**
 * DEFAULT CONFIG
 */
function getDefaultConfig() {
  return {
    enabled: true,
    ignoreBots: true,
    ignoreAdmins: true,
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    ignoredUserIds: [],

    antiSpam: {
      enabled: false,
      maxMessages: 6,
      intervalSeconds: 8,
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    antiLink: {
      enabled: false,
      allowedDomains: [],
      blockedDomains: [], // 🔥 NEW
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    antiInvite: {
      enabled: false,
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    capsAbuse: {
      enabled: false,
      minLength: 10,
      percentage: 70,
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    badWords: {
      enabled: false,
      words: [],
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    repeatedMessages: {
      enabled: false,
      maxRepeats: 3,
      intervalSeconds: 10,
      punishments: ['delete'],
      timeoutMinutes: 10,
    },

    logs: {
      enabled: true,
      channelId: null,
    },
  };
}

/**
 * DEEP MERGE (critical fix 🔥)
 */
function deepMerge(target, source) {
  if (!source) return target;

  const output = { ...target };

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      output[key] = deepMerge(target[key] || {}, value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

/**
 * GET CONFIG
 */
function getGuildAutoModConfig(guildId) {
  return guildManager.getGuildSection(
    guildId,
    'automod',
    getDefaultConfig()
  );
}

/**
 * SAVE FULL CONFIG
 */
function saveGuildAutoModConfig(guildId, config) {
  return guildManager.replaceGuildSection(
    guildId,
    'automod',
    config
  );
}

/**
 * UPDATE (SAFE MERGE) 🔥
 */
function updateGuildAutoModConfig(guildId, updater) {
  const current = getGuildAutoModConfig(guildId);

  const next =
    typeof updater === 'function'
      ? updater(JSON.parse(JSON.stringify(current)))
      : deepMerge(current, updater); // 🔥 FIX HERE

  return saveGuildAutoModConfig(guildId, next);
}

/**
 * RESET
 */
function resetGuildAutoModConfig(guildId) {
  return saveGuildAutoModConfig(guildId, getDefaultConfig());
}

module.exports = {
  getDefaultConfig,
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,
};