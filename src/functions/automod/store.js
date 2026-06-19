const guildStore = require('../../guild/guildManager')
const defaultConfig = require('./config');
const { normalizePunishments } = require('./actions');

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
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
  const punishments = normalizePunishments(
    rule?.punishments ?? rule?.punishment,
    defaults.punishments ?? [defaults.punishment || 'delete']
  );

  return {
    ...defaults,
    ...rule,
    enabled: toBoolean(rule?.enabled, defaults.enabled ?? false),
    punishments,
    punishment: punishments[0],
    timeoutMinutes: toSafeNumber(
      rule?.timeoutMinutes,
      defaults.timeoutMinutes ?? 10
    ),
  };
}

function sanitizeConfig(input = {}) {
  const defaults = defaultConfig;
  const sourceRules = input?.rules || {};

  const antiSpam = normalizeRule(
    input?.antiSpam || sourceRules.antiSpam,
    defaults.antiSpam
  );

  antiSpam.maxMessages = toSafeNumber(
    input?.antiSpam?.maxMessages ?? sourceRules?.antiSpam?.maxMessages,
    defaults.antiSpam.maxMessages
  );

  antiSpam.intervalSeconds = toSafeNumber(
    input?.antiSpam?.intervalSeconds ?? sourceRules?.antiSpam?.intervalSeconds,
    defaults.antiSpam.intervalSeconds
  );

  const antiLink = normalizeRule(
    input?.antiLink || sourceRules.antiLink,
    defaults.antiLink
  );

  antiLink.allowedDomains = toStringArray(
    input?.antiLink?.allowedDomains ?? sourceRules?.antiLink?.allowedDomains
  );

  antiLink.blockedDomains = toStringArray(
    input?.antiLink?.blockedDomains ?? sourceRules?.antiLink?.blockedDomains
  );

  const antiInvite = normalizeRule(
    input?.antiInvite || sourceRules.antiInvite,
    defaults.antiInvite
  );

  const capsAbuse = normalizeRule(
    input?.capsAbuse || sourceRules.capsAbuse,
    defaults.capsAbuse
  );

  capsAbuse.minLength = toSafeNumber(
    input?.capsAbuse?.minLength ?? sourceRules?.capsAbuse?.minLength,
    defaults.capsAbuse.minLength
  );

  capsAbuse.percentage = toSafeNumber(
    input?.capsAbuse?.percentage ?? sourceRules?.capsAbuse?.percentage,
    defaults.capsAbuse.percentage
  );

  const badWords = normalizeRule(
    input?.badWords || sourceRules.badWords,
    defaults.badWords
  );

  badWords.words = toStringArray(
    input?.badWords?.words ?? sourceRules?.badWords?.words
  );

  const repeatedMessages = normalizeRule(
    input?.repeatedMessages || sourceRules.repeatedMessages,
    defaults.repeatedMessages
  );

  repeatedMessages.maxRepeats = toSafeNumber(
    input?.repeatedMessages?.maxRepeats ??
      sourceRules?.repeatedMessages?.maxRepeats,
    defaults.repeatedMessages.maxRepeats
  );

  repeatedMessages.intervalSeconds = toSafeNumber(
    input?.repeatedMessages?.intervalSeconds ??
      sourceRules?.repeatedMessages?.intervalSeconds,
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
    dmWarnings: toBoolean(input?.dmWarnings, defaults.dmWarnings),

    ignoredChannelIds: toStringArray(input?.ignoredChannelIds)
      .map(extractId)
      .filter(Boolean),

    ignoredUserIds: toStringArray(input?.ignoredUserIds)
      .map(extractId)
      .filter(Boolean),

    ignoredRoleIds: toStringArray(input?.ignoredRoleIds)
      .map(extractId)
      .filter(Boolean),

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
        timeoutMs:
          Number(config.repeatedMessages.timeoutMinutes || 10) * 60 * 1000,
      },
    },
  };
}

function getDefaultConfig() {
  return structuredCloneSafe(defaultConfig);
}

function getGuildAutoModConfig(guildId) {
  const config = guildStore.getGuildSection(
    guildId,
    'automod',
    getDefaultConfig()
  );

  return attachComputedRules(sanitizeConfig(config));
}

function saveGuildAutoModConfig(guildId, config) {
  const safeConfig = sanitizeConfig(config);
  const saved = guildStore.replaceGuildSection(guildId, 'automod', safeConfig);

  return attachComputedRules(sanitizeConfig(saved));
}

function updateGuildAutoModConfig(guildId, updater) {
  const current = getGuildAutoModConfig(guildId);
  const plainCurrent = structuredCloneSafe(current);

  delete plainCurrent.rules;

  const next =
    typeof updater === 'function'
      ? updater(plainCurrent)
      : { ...plainCurrent, ...updater };

  return saveGuildAutoModConfig(guildId, next);
}

function resetGuildAutoModConfig(guildId) {
  return saveGuildAutoModConfig(guildId, getDefaultConfig());
}

module.exports = {
  getDefaultConfig,
  sanitizeConfig,
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,
};