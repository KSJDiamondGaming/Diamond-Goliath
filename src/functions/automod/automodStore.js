// functions/automod/automodStore.js

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const guildManager = require('../../guild/guildManager');

const spamTracker = new Map();
const repeatTracker = new Map();

const TRACKER_CLEANUP_INTERVAL_MS = 60 * 1000;
const TRACKER_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MINUTES = 10;

const INVITE_REGEX =
  /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

const URL_REGEX =
  /((https?:\/\/)|(www\.))?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}([^\s]*)/i;

const VALID_PUNISHMENTS = ['dm', 'delete', 'warn', 'timeout', 'kick', 'ban'];

const RULE_META = {
  'Anti-Link': { emoji: '🔗', color: '#e74c3c', severity: 'High' },
  'Blacklisted Domain': { emoji: '⛔', color: '#c0392b', severity: 'Critical' },
  'Suspicious Domain': { emoji: '⚠️', color: '#e67e22', severity: 'High' },
  'Caps Abuse': { emoji: '🔠', color: '#f39c12', severity: 'Medium' },
  'Bad Words': { emoji: '🚫', color: '#c0392b', severity: 'High' },
  'Anti-Spam': { emoji: '📨', color: '#9b59b6', severity: 'Medium' },
  'Repeated Messages': { emoji: '🔁', color: '#8e44ad', severity: 'Low' },
  'Anti-Invite': { emoji: '📩', color: '#3498db', severity: 'High' },
};

const ACTION_LABELS = {
  dm: 'DM sent',
  delete: 'Message deleted',
  warn: 'User warned in channel',
  'warn-dm': 'User warned by DM',
  timeout: 'User timed out',
  kick: 'User kicked',
  ban: 'User banned',
};

const SUSPICIOUS_TLDS = [
  '.ru',
  '.xyz',
  '.tk',
  '.to',
  '.biz',
  '.info',
  '.click',
];

/* ---------------- DEFAULTS ---------------- */

function getDefaultRule(overrides = {}) {
  return {
    enabled: false,
    punishments: ['delete'],
    punishment: 'delete',
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    ...overrides,
  };
}

function getDefaultConfig() {
  return {
    enabled: true,
    ignoreBots: true,
    ignoreAdmins: true,
    dmWarnings: false,

    ignoredChannelIds: [],
    ignoredUserIds: [],
    ignoredRoleIds: [],

    antiSpam: getDefaultRule({
      maxMessages: 6,
      intervalSeconds: 8,
    }),

    antiLink: getDefaultRule({
      allowedDomains: [],
      blockedDomains: [],
    }),

    antiInvite: getDefaultRule(),

    capsAbuse: getDefaultRule({
      minLength: 10,
      percentage: 70,
    }),

    badWords: getDefaultRule({
      words: [],
    }),

    repeatedMessages: getDefaultRule({
      maxRepeats: 3,
      intervalSeconds: 10,
    }),

    logs: {
      enabled: true,
      channelId: null,
    },
  };
}

/* ---------------- HELPERS ---------------- */

function now() {
  return Date.now();
}

function cloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function toSafeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return fallback;
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function extractId(value) {
  if (!value) return null;

  const match = String(value).match(/\d{16,20}/);
  return match ? match[0] : null;
}

function normalizeMessage(content) {
  return String(content || '').trim().toLowerCase();
}

function getMemberKey(message) {
  return `${message.guild.id}:${message.author.id}`;
}

function getRulePunishments(rule) {
  return normalizePunishments(rule?.punishments ?? rule?.punishment);
}

function normalizePunishments(value, fallback = ['delete']) {
  const base = Array.isArray(value) ? value : value ? [value] : fallback;

  const cleaned = base
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => VALID_PUNISHMENTS.includes(entry));

  return cleaned.length ? [...new Set(cleaned)] : [...fallback];
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
      defaults.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES
    ),
  };
}

function normalizeDomainList(value) {
  return toStringArray(value)
    .map((domain) =>
      domain
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .trim()
    )
    .filter(Boolean);
}

/* ---------------- CONFIG ---------------- */

function sanitizeConfig(input = {}) {
  const defaults = getDefaultConfig();
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

  antiLink.allowedDomains = normalizeDomainList(
    input?.antiLink?.allowedDomains ?? sourceRules?.antiLink?.allowedDomains
  );

  antiLink.blockedDomains = normalizeDomainList(
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

function withComputedRules(config) {
  return {
    ...config,
    rules: {
      antiSpam: {
        ...config.antiSpam,
        intervalMs: Number(config.antiSpam.intervalSeconds || 8) * 1000,
        timeoutMs:
          Number(config.antiSpam.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) *
          60 *
          1000,
      },

      antiLink: {
        ...config.antiLink,
        timeoutMs:
          Number(config.antiLink.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) *
          60 *
          1000,
      },

      antiInvite: {
        ...config.antiInvite,
        timeoutMs:
          Number(config.antiInvite.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) *
          60 *
          1000,
      },

      capsAbuse: {
        ...config.capsAbuse,
        timeoutMs:
          Number(config.capsAbuse.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) *
          60 *
          1000,
      },

      badWords: {
        ...config.badWords,
        timeoutMs:
          Number(config.badWords.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) *
          60 *
          1000,
      },

      repeatedMessages: {
        ...config.repeatedMessages,
        intervalMs: Number(config.repeatedMessages.intervalSeconds || 10) * 1000,
        timeoutMs:
          Number(
            config.repeatedMessages.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES
          ) *
          60 *
          1000,
      },
    },
  };
}

/* ---------------- STORE API ---------------- */

function getGuildAutoModConfig(guildId) {
  const config = guildManager.getGuildSection(
    guildId,
    'automod',
    getDefaultConfig()
  );

  return withComputedRules(sanitizeConfig(config));
}

function saveGuildAutoModConfig(guildId, config) {
  const safeConfig = sanitizeConfig(config);
  const saved = guildManager.replaceGuildSection(guildId, 'automod', safeConfig);

  return withComputedRules(sanitizeConfig(saved));
}

function updateGuildAutoModConfig(guildId, updater) {
  const current = getGuildAutoModConfig(guildId);
  const plainCurrent = cloneSafe(current);

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

/* ---------------- BYPASS ---------------- */

function hasBypass(message, config) {
  if (!message.guild || !message.member) return true;
  if (!config?.enabled) return true;
  if (message.author.bot && config.ignoreBots) return true;

  const isAdmin = message.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );

  if (config.ignoreAdmins && isAdmin) return true;
  if (config.ignoredChannelIds.includes(message.channel.id)) return true;
  if (config.ignoredUserIds.includes(message.author.id)) return true;

  return Boolean(
    message.member.roles?.cache?.some((role) =>
      config.ignoredRoleIds.includes(role.id)
    )
  );
}

/* ---------------- LOGGING ---------------- */

function formatAutomodActions(action) {
  const actions = String(action || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return actions.map((entry) => ACTION_LABELS[entry] || entry).join('\n');
}

async function resolveAutomodLogChannel(message, config) {
  const logChannelId =
    config?.logs?.channelId ||
    guildManager.getLogChannelId(message.guild.id, 'automod', 'general');

  if (!logChannelId) return null;

  return (
    message.guild.channels.cache.get(logChannelId) ||
    (await message.guild.channels.fetch(logChannelId).catch(() => null))
  );
}

async function sendAutomodLog(message, config, details) {
  try {
    if (!message?.guild) return;
    if (!config?.logs?.enabled) return;

    if (!guildManager.isLogEventEnabled(message.guild.id, 'automodActions')) {
      return;
    }

    const logChannel = await resolveAutomodLogChannel(message, config);

    if (!logChannel?.isTextBased()) return;

    const meta = RULE_META[details.rule] || {
      emoji: '🔐',
      color: '#ff5555',
      severity: 'Medium',
    };

    const embed = new EmbedBuilder()
      .setColor(meta.color)
      .setTitle(`${meta.emoji} AutoMod: ${details.rule || 'Triggered'}`)
      .addFields(
        {
          name: 'User',
          value: `${message.author} (${message.author.id})`,
        },
        {
          name: 'Channel',
          value: `${message.channel}`,
        },
        {
          name: 'Rule',
          value: details.rule || 'Unknown',
          inline: true,
        },
        {
          name: 'Actions Taken',
          value: formatAutomodActions(details.action || 'delete'),
          inline: true,
        },
        {
          name: 'Severity',
          value: meta.severity,
          inline: true,
        }
      )
      .setTimestamp();

    if (details.reason) {
      embed.addFields({
        name: 'Reason',
        value: details.reason,
      });
    }

    if (details.content) {
      const clipped =
        details.content.length > 1024
          ? `${details.content.slice(0, 1021)}...`
          : details.content;

      embed.addFields({
        name: 'Message Content',
        value: clipped,
      });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Failed to send automod log:', error);
  }
}

/* ---------------- LINK HELPERS ---------------- */

function normalizeLinkContent(content) {
  return String(content || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\[dot\]|\(dot\)|\{dot\}|dot/gi, '.')
    .replace(/\[.\]|\(.\)|\{.\}/g, '.');
}

function extractDomains(content) {
  const cleaned = normalizeLinkContent(content);
  return cleaned.match(/[a-z0-9-]+\.[a-z]{2,}/g) || [];
}

function hasSuspiciousLinkBehaviour(content) {
  const raw = String(content || '').toLowerCase();
  const compact = normalizeLinkContent(raw);

  const suspiciousPatterns = [
    /discord\s*\.?\s*gg/i,
    /discord\s*\.?\s*com\s*\/\s*invite/i,
    /www\s*\.\s*[a-z0-9-]+\s*\./i,
    /[a-z0-9-]+\s*\.\s*(com|net|org|gg|io|co|uk|xyz|ru|to|tv|me|info|biz)/i,
    /h\s*t\s*t\s*p\s*s?\s*:/i,
  ];

  return (
    suspiciousPatterns.some((pattern) => pattern.test(raw)) ||
    URL_REGEX.test(compact)
  );
}

function isAllowedDomain(content, allowedDomains = []) {
  if (!allowedDomains.length) return false;

  const lowered = String(content || '').toLowerCase();

  return allowedDomains.some((domain) => {
    const clean = String(domain || '').trim().toLowerCase();
    return clean && lowered.includes(clean);
  });
}

function isBlockedDomain(content, blockedDomains = []) {
  if (!blockedDomains.length) return false;

  const domains = extractDomains(content);

  return domains.some((domain) =>
    blockedDomains.some((blocked) => {
      const cleanBlocked = String(blocked || '').toLowerCase().trim();
      return domain === cleanBlocked || domain.endsWith(`.${cleanBlocked}`);
    })
  );
}

function isSuspiciousDomain(domain) {
  return SUSPICIOUS_TLDS.some((tld) => domain.endsWith(tld));
}

function hasBadReputation(content) {
  const domains = extractDomains(content);
  return domains.some((domain) => isSuspiciousDomain(domain));
}

/* ---------------- RULE CHECKS ---------------- */

function makeRuleHit(rule, reason, configRule) {
  return {
    rule,
    reason,
    punishments: getRulePunishments(configRule),
    timeoutMinutes: configRule?.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES,
  };
}

function checkAntiInvite(content, config) {
  if (!config?.antiInvite?.enabled) return null;
  if (!INVITE_REGEX.test(content)) return null;

  return makeRuleHit(
    'Anti-Invite',
    'Discord invite links are not allowed.',
    config.antiInvite
  );
}

function checkAntiLink(content, config) {
  if (!config?.antiLink?.enabled) return null;
  if (!hasSuspiciousLinkBehaviour(content)) return null;

  if (isBlockedDomain(content, config.antiLink.blockedDomains)) {
    return makeRuleHit(
      'Blacklisted Domain',
      'This domain is explicitly blocked.',
      config.antiLink
    );
  }

  if (hasBadReputation(content)) {
    return makeRuleHit(
      'Suspicious Domain',
      'Domain has a suspicious reputation.',
      config.antiLink
    );
  }

  if (isAllowedDomain(content, config.antiLink.allowedDomains)) return null;

  return makeRuleHit(
    'Anti-Link',
    'Suspicious or blocked link detected.',
    config.antiLink
  );
}

function checkCapsAbuse(content, config) {
  if (!config?.capsAbuse?.enabled) return null;

  const minLength = Number(config.capsAbuse.minLength || 10);
  const threshold = Number(config.capsAbuse.percentage || 70);
  const lettersOnly = String(content || '').replace(/[^a-zA-Z]/g, '');

  if (lettersOnly.length < minLength) return null;

  const upperCount = lettersOnly
    .split('')
    .filter((char) => char === char.toUpperCase()).length;

  const percentage = (upperCount / lettersOnly.length) * 100;

  if (percentage < threshold) return null;

  return makeRuleHit(
    'Caps Abuse',
    `Too many capital letters (${Math.round(percentage)}%).`,
    config.capsAbuse
  );
}

function checkBadWords(content, config) {
  if (!config?.badWords?.enabled) return null;

  const words = Array.isArray(config.badWords.words) ? config.badWords.words : [];
  if (!words.length) return null;

  const lowered = String(content || '').toLowerCase();

  const matched = words.find((word) => {
    const clean = String(word || '').trim().toLowerCase();
    return clean && lowered.includes(clean);
  });

  if (!matched) return null;

  return makeRuleHit(
    'Bad Words',
    `Blocked word detected: ${matched}`,
    config.badWords
  );
}

function checkRepeatedMessages(message, config) {
  if (!config?.repeatedMessages?.enabled) return null;

  const key = getMemberKey(message);
  const content = normalizeMessage(message.content);

  if (!content) return null;

  const maxRepeats = Number(config.repeatedMessages.maxRepeats || 3);
  const intervalMs = Number(config.repeatedMessages.intervalSeconds || 10) * 1000;
  const currentTime = now();

  const entry = repeatTracker.get(key) || {
    lastContent: null,
    count: 0,
    updatedAt: 0,
  };

  if (
    entry.lastContent === content &&
    currentTime - entry.updatedAt <= intervalMs
  ) {
    entry.count += 1;
  } else {
    entry.lastContent = content;
    entry.count = 1;
  }

  entry.updatedAt = currentTime;
  repeatTracker.set(key, entry);

  if (entry.count < maxRepeats) return null;

  return makeRuleHit(
    'Repeated Messages',
    `Same message repeated ${entry.count} times.`,
    config.repeatedMessages
  );
}

function getNonEmptyLineCount(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function checkAntiSpam(message, config) {
  if (!config?.antiSpam?.enabled) return null;

  const key = getMemberKey(message);
  const maxMessages = Number(config.antiSpam.maxMessages || 6);
  const intervalMs = Number(config.antiSpam.intervalSeconds || 8) * 1000;
  const cutoff = now() - intervalMs;

  const entries = spamTracker.get(key) || [];
  const freshEntries = entries.filter((timestamp) => timestamp >= cutoff);

  freshEntries.push(now());
  spamTracker.set(key, freshEntries);

  if (freshEntries.length >= maxMessages) {
    return makeRuleHit(
      'Anti-Spam',
      `${freshEntries.length} messages sent in ${intervalMs / 1000} seconds.`,
      config.antiSpam
    );
  }

  const nonEmptyLineCount = getNonEmptyLineCount(message.content);

  if (nonEmptyLineCount >= maxMessages) {
    return makeRuleHit(
      'Anti-Spam',
      `${nonEmptyLineCount} message lines sent in a single message.`,
      config.antiSpam
    );
  }

  return null;
}

/* ---------------- CLEANUP ---------------- */

function cleanupTrackers() {
  const cutoff = now() - TRACKER_MAX_AGE_MS;

  for (const [key, timestamps] of spamTracker.entries()) {
    const fresh = timestamps.filter((timestamp) => timestamp >= cutoff);

    if (fresh.length) {
      spamTracker.set(key, fresh);
    } else {
      spamTracker.delete(key);
    }
  }

  for (const [key, entry] of repeatTracker.entries()) {
    if (entry.updatedAt < cutoff) {
      repeatTracker.delete(key);
    }
  }
}

setInterval(cleanupTrackers, TRACKER_CLEANUP_INTERVAL_MS).unref();

/* ---------------- MAIN RUNNER ---------------- */

function getAutomodHit(message, config) {
  const checks = [
    checkAntiInvite(message.content, config),
    checkAntiLink(message.content, config),
    checkCapsAbuse(message.content, config),
    checkBadWords(message.content, config),
    checkRepeatedMessages(message, config),
    checkAntiSpam(message, config),
  ];

  return checks.find(Boolean) || null;
}

async function runAutomod(message) {
  if (!message?.guild) return { blocked: false };
  if (!message.content) return { blocked: false };

  const config = getGuildAutoModConfig(message.guild.id);

  if (!config || hasBypass(message, config)) {
    return { blocked: false };
  }

  const hit = getAutomodHit(message, config);
  if (!hit) return { blocked: false };

  return {
    blocked: true,
    rule: hit.rule,
    reason: hit.reason,
    punishments: hit.punishments,
    timeoutMinutes: hit.timeoutMinutes,
  };
}

module.exports = {
  VALID_PUNISHMENTS,
  RULE_META,
  ACTION_LABELS,

  getDefaultConfig,

  sanitizeConfig,
  withComputedRules,

  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,

  normalizePunishments,
  normalizeDomainList,
  normalizeLinkContent,
  extractDomains,

  checkAntiInvite,
  checkAntiLink,
  checkCapsAbuse,
  checkBadWords,
  checkRepeatedMessages,
  checkAntiSpam,

  sendAutomodLog,
  runAutomod,
};