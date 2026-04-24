const path = require('path');
const { read: readJson, write: writeJson } = require('./fileStore');
const guildManager = require('./guildManager');

const AUTOMOD_PATH = path.join(__dirname, '..', 'data', 'automod.json');

function getDefaultConfig() {
  return {
    antiSpam: {
      enabled: false,
      maxMessages: 6,
      intervalSeconds: 8,
      punishment: 'delete',
    },
    antiLink: {
      enabled: false,
      punishment: 'delete',
    },
    antiInvite: {
      enabled: false,
      punishment: 'delete',
    },
    capsAbuse: {
      enabled: false,
      minLength: 10,
      percentage: 70,
      punishment: 'delete',
    },
    badWords: {
      enabled: false,
      words: [],
      punishment: 'delete',
    },
    repeatedMessages: {
      enabled: false,
      maxRepeats: 3,
      punishment: 'delete',
    },
    logs: {
      enabled: true,
      channelId: '',
    },
  };
}

function sanitizeConfig(input = {}) {
  const defaults = getDefaultConfig();

  return {
    antiSpam: {
      enabled: Boolean(input?.antiSpam?.enabled),
      maxMessages: Number(input?.antiSpam?.maxMessages ?? defaults.antiSpam.maxMessages),
      intervalSeconds: Number(input?.antiSpam?.intervalSeconds ?? defaults.antiSpam.intervalSeconds),
      punishment: input?.antiSpam?.punishment || defaults.antiSpam.punishment,
    },
    antiLink: {
      enabled: Boolean(input?.antiLink?.enabled),
      punishment: input?.antiLink?.punishment || defaults.antiLink.punishment,
    },
    antiInvite: {
      enabled: Boolean(input?.antiInvite?.enabled),
      punishment: input?.antiInvite?.punishment || defaults.antiInvite.punishment,
    },
    capsAbuse: {
      enabled: Boolean(input?.capsAbuse?.enabled),
      minLength: Number(input?.capsAbuse?.minLength ?? defaults.capsAbuse.minLength),
      percentage: Number(input?.capsAbuse?.percentage ?? defaults.capsAbuse.percentage),
      punishment: input?.capsAbuse?.punishment || defaults.capsAbuse.punishment,
    },
    badWords: {
      enabled: Boolean(input?.badWords?.enabled),
      words: Array.isArray(input?.badWords?.words)
        ? input.badWords.words.map((word) => String(word).trim()).filter(Boolean)
        : [],
      punishment: input?.badWords?.punishment || defaults.badWords.punishment,
    },
    repeatedMessages: {
      enabled: Boolean(input?.repeatedMessages?.enabled),
      maxRepeats: Number(input?.repeatedMessages?.maxRepeats ?? defaults.repeatedMessages.maxRepeats),
      punishment: input?.repeatedMessages?.punishment || defaults.repeatedMessages.punishment,
    },
    logs: {
      enabled: input?.logs?.enabled !== false,
      channelId: String(input?.logs?.channelId || '').trim(),
    },
  };
}

function getGuildAutoModConfig(guildId) {
  const data = readJson(AUTOMOD_PATH, {});
  return data[guildId] || getDefaultConfig();
}

function saveGuildAutoModConfig(guildId, config) {
  const data = readJson(AUTOMOD_PATH, {});
  const safeConfig = sanitizeConfig(config);

  data[guildId] = safeConfig;
  writeJson(AUTOMOD_PATH, data);

  return safeConfig;
}

module.exports = {
  getDefaultConfig,
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
};
