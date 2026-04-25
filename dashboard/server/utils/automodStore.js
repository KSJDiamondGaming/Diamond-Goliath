const guildManager = require('../../../dashboard/server/utils/guildManager');

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
      blockedDomains: [],
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

function getGuildAutoModConfig(guildId) {
  return guildManager.getGuildSection(
    guildId,
    'automod',
    getDefaultConfig()
  );
}

function saveGuildAutoModConfig(guildId, config) {
  return guildManager.replaceGuildSection(
    guildId,
    'automod',
    config
  );
}

function updateGuildAutoModConfig(guildId, updater) {
  const current = getGuildAutoModConfig(guildId);

  const next =
    typeof updater === 'function'
      ? updater(JSON.parse(JSON.stringify(current)))
      : { ...current, ...updater };

  return saveGuildAutoModConfig(guildId, next);
}

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