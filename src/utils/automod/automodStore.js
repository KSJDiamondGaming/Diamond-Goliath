const fs = require('fs');
const path = require('path');

const AUTOMOD_PATH = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'automodSettings.json'
);

function ensureFile() {
  const dir = path.dirname(AUTOMOD_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(AUTOMOD_PATH)) {
    fs.writeFileSync(AUTOMOD_PATH, '{}', 'utf8');
  }
}

function readAutoModData() {
  ensureFile();

  try {
    const raw = fs.readFileSync(AUTOMOD_PATH, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Failed to read automod data:', error);
    return {};
  }
}

function writeAutoModData(data) {
  ensureFile();

  try {
    fs.writeFileSync(AUTOMOD_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write automod data:', error);
    return false;
  }
}

function getDefaultConfig() {
  return {
    enabled: true,
    ignoreBots: true,
    ignoreAdmins: true,
    ignoredChannelIds: [],
    ignoredUserIds: [],
    ignoredRoleIds: [],
    antiSpam: {
      enabled: false,
      maxMessages: 6,
      intervalSeconds: 8,
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    antiLink: {
      enabled: false,
      allowedDomains: [],
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    antiInvite: {
      enabled: false,
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    capsAbuse: {
      enabled: false,
      minLength: 10,
      percentage: 70,
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    badWords: {
      enabled: false,
      words: [],
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    repeatedMessages: {
      enabled: false,
      maxRepeats: 3,
      intervalSeconds: 10,
      punishment: 'delete',
      timeoutMinutes: 10,
    },
    logs: {
      enabled: true,
      channelId: null,
    },
  };
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function extractId(value) {
  if (!value) return null;

  const match = String(value).match(/\d{16,20}/);
  return match ? match[0] : null;
}

function normalizeRule(rule = {}, defaults = {}) {
  return {
    ...defaults,
    ...rule,
    enabled: toBoolean(rule?.enabled, defaults.enabled ?? false),
    punishment: String(rule?.punishment || defaults.punishment || 'delete').toLowerCase(),
    timeoutMinutes: toSafeNumber(rule?.timeoutMinutes, defaults.timeoutMinutes ?? 10),
  };
}

function sanitizeConfig(input = {}) {
  const defaults = getDefaultConfig();
  const sourceRules = input?.rules || {};

  const antiSpam = normalizeRule(input?.antiSpam || sourceRules.antiSpam, defaults.antiSpam);
  antiSpam.maxMessages = toSafeNumber(
    input?.antiSpam?.maxMessages ?? sourceRules?.antiSpam?.maxMessages,
    defaults.antiSpam.maxMessages
  );
  antiSpam.intervalSeconds = toSafeNumber(
    input?.antiSpam?.intervalSeconds ?? sourceRules?.antiSpam?.intervalSeconds,
    defaults.antiSpam.intervalSeconds
  );

  const antiLink = normalizeRule(input?.antiLink || sourceRules.antiLink, defaults.antiLink);
  antiLink.allowedDomains = toStringArray(
    input?.antiLink?.allowedDomains ?? sourceRules?.antiLink?.allowedDomains
  );

  const antiInvite = normalizeRule(input?.antiInvite || sourceRules.antiInvite, defaults.antiInvite);

  const capsAbuse = normalizeRule(input?.capsAbuse || sourceRules.capsAbuse, defaults.capsAbuse);
  capsAbuse.minLength = toSafeNumber(
    input?.capsAbuse?.minLength ?? sourceRules?.capsAbuse?.minLength,
    defaults.capsAbuse.minLength
  );
  capsAbuse.percentage = toSafeNumber(
    input?.capsAbuse?.percentage ?? sourceRules?.capsAbuse?.percentage,
    defaults.capsAbuse.percentage
  );

  const badWords = normalizeRule(input?.badWords || sourceRules.badWords, defaults.badWords);
  badWords.words = toStringArray(
    input?.badWords?.words ?? sourceRules?.badWords?.words
  );

  const repeatedMessages = normalizeRule(
    input?.repeatedMessages || sourceRules.repeatedMessages,
    defaults.repeatedMessages
  );
  repeatedMessages.maxRepeats = toSafeNumber(
    input?.repeatedMessages?.maxRepeats ?? sourceRules?.repeatedMessages?.maxRepeats,
    defaults.repeatedMessages.maxRepeats
  );
  repeatedMessages.intervalSeconds = toSafeNumber(
    input?.repeatedMessages?.intervalSeconds ?? sourceRules?.repeatedMessages?.intervalSeconds,
    defaults.repeatedMessages.intervalSeconds
  );

  const logChannelId =
    extractId(input?.logs?.channelId) ||
    extractId(input?.logs?.channel) ||
    extractId(input?.logChannelId) ||
    extractId(input?.logChannel) ||
    null;

  return {
    enabled: toBoolean(input?.enabled, defaults.enabled),
    ignoreBots: toBoolean(input?.ignoreBots, defaults.ignoreBots),
    ignoreAdmins: toBoolean(input?.ignoreAdmins, defaults.ignoreAdmins),
    ignoredChannelIds: toStringArray(input?.ignoredChannelIds).map(extractId).filter(Boolean),
    ignoredUserIds: toStringArray(input?.ignoredUserIds).map(extractId).filter(Boolean),
    ignoredRoleIds: toStringArray(input?.ignoredRoleIds).map(extractId).filter(Boolean),
    antiSpam,
    antiLink,
    antiInvite,
    capsAbuse,
    badWords,
    repeatedMessages,
    logs: {
      enabled: toBoolean(
        input?.logs?.enabled ?? input?.logsEnabled,
        defaults.logs.enabled
      ),
      channelId: logChannelId,
    },
  };
}

function attachComputedRules(config) {
  return {
    ...config,
    rules: {
      antiSpam: {
        ...config.antiSpam,
        intervalMs: Number(config.antiSpam.intervalSeconds || 8) * 1000,
        timeoutMs: Number(config.antiSpam.timeoutMinutes || 10) * 60 * 1000,
      },
      antiLink: {
        ...config.antiLink,
        timeoutMs: Number(config.antiLink.timeoutMinutes || 10) * 60 * 1000,
      },
      antiInvite: {
        ...config.antiInvite,
        timeoutMs: Number(config.antiInvite.timeoutMinutes || 10) * 60 * 1000,
      },
      capsAbuse: {
        ...config.capsAbuse,
        timeoutMs: Number(config.capsAbuse.timeoutMinutes || 10) * 60 * 1000,
      },
      badWords: {
        ...config.badWords,
        timeoutMs: Number(config.badWords.timeoutMinutes || 10) * 60 * 1000,
      },
      repeatedMessages: {
        ...config.repeatedMessages,
        intervalMs: Number(config.repeatedMessages.intervalSeconds || 10) * 1000,
        timeoutMs: Number(config.repeatedMessages.timeoutMinutes || 10) * 60 * 1000,
      },
    },
  };
}

function getGuildAutoModConfig(guildId) {
  const data = readAutoModData();

  if (!data[guildId]) {
    data[guildId] = getDefaultConfig();
    writeAutoModData(data);
  }

  const safeConfig = sanitizeConfig(data[guildId]);
  return attachComputedRules(safeConfig);
}

function saveGuildAutoModConfig(guildId, config) {
  const data = readAutoModData();
  const safeConfig = sanitizeConfig(config);

  data[guildId] = safeConfig;
  writeAutoModData(data);

  return attachComputedRules(safeConfig);
}

function updateGuildAutoModConfig(guildId, updater) {
  const current = getGuildAutoModConfig(guildId);
  const next =
    typeof updater === 'function'
      ? updater(structuredCloneSafe(current))
      : { ...current, ...updater };

  return saveGuildAutoModConfig(guildId, next);
}

function resetGuildAutoModConfig(guildId) {
  return saveGuildAutoModConfig(guildId, getDefaultConfig());
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  AUTOMOD_PATH,
  getDefaultConfig,
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,
};