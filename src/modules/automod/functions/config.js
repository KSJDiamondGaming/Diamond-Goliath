module.exports = {
  enabled: true,
  ignoreBots: true,
  ignoreAdmins: true,
  dmWarnings: false,

  ignoredChannelIds: [],
  ignoredUserIds: [],
  ignoredRoleIds: [],

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
