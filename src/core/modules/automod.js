const { PermissionsBitField } = require('discord.js');
const guildStore = require('../guild/store');
const logService = require('../logs/service');
const { LOG_TYPES } = require('../logs/types');

const spamTracker = new Map();
const repeatTracker = new Map();

const INVITE_REGEX =
  /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

const URL_REGEX =
  /((https?:\/\/)|(www\.))?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}([^\s]*)/i;

const VALID_PUNISHMENTS = ['delete', 'warn', 'timeout', 'kick', 'ban'];

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

  return suspiciousPatterns.some((pattern) => pattern.test(raw)) || URL_REGEX.test(compact);
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

    antiSpam: {
      enabled: false,
      maxMessages: 6,
      intervalSeconds: 8,
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    antiLink: {
      enabled: false,
      allowedDomains: [],
      blockedDomains: [],
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    antiInvite: {
      enabled: false,
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    capsAbuse: {
      enabled: false,
      minLength: 10,
      percentage: 70,
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    badWords: {
      enabled: false,
      words: [],
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    repeatedMessages: {
      enabled: false,
      maxRepeats: 3,
      intervalSeconds: 10,
      punishments: ['delete'],
      punishment: 'delete',
      timeoutMinutes: 10,
    },

    logs: {
      enabled: true,
      channelId: null,
    },
  };
}

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

function normalizePunishments(value, fallback = ['delete']) {
  const base = Array.isArray(value) ? value : value ? [value] : fallback;

  const cleaned = base
    .map((entry) => String(entry).trim().toLowerCase())
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
      defaults.timeoutMinutes ?? 10
    ),
  };
}

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

function now() {
  return Date.now();
}

function normalizeMessage(content) {
  return String(content || '').trim().toLowerCase();
}

function getMemberKey(message) {
  return `${message.guild.id}:${message.author.id}`;
}

function hasBypass(message, config) {
  if (!message.guild || !message.member) return true;
  if (!config) return true;
  if (!config.enabled) return true;
  if (message.author.bot && config.ignoreBots) return true;

  const isAdmin = message.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );

  if (config.ignoreAdmins && isAdmin) return true;
  if (config.ignoredChannelIds.includes(message.channel.id)) return true;
  if (config.ignoredUserIds.includes(message.author.id)) return true;

  if (
    message.member.roles?.cache?.some((role) =>
      config.ignoredRoleIds.includes(role.id)
    )
  ) {
    return true;
  }

  return false;
}

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
      return true;
    }
  } catch (error) {
    console.error('❌ Failed to delete automod message:', error);
  }

  return false;
}

async function safeTimeout(member, durationMs, reason) {
  try {
    if (!member || !member.moderatable) return false;

    await member.timeout(durationMs, reason);
    return true;
  } catch (error) {
    console.error('❌ Failed to timeout automod member:', error);
    return false;
  }
}

async function safeKick(member, reason) {
  try {
    if (!member || !member.kickable) return false;

    await member.kick(reason);
    return true;
  } catch (error) {
    console.error('❌ Failed to kick automod member:', error);
    return false;
  }
}

async function safeBan(member, reason) {
  try {
    if (!member || !member.bannable) return false;

    await member.ban({ reason });
    return true;
  } catch (error) {
    console.error('❌ Failed to ban automod member:', error);
    return false;
  }
}

async function safeWarnChannel(message, text) {
  try {
    const sent = await message.channel.send({ content: text });

    setTimeout(() => {
      sent.delete().catch(() => {});
    }, 5000);

    return true;
  } catch (error) {
    console.error('❌ Failed to send automod warning message:', error);
    return false;
  }
}

async function safeWarnDM(user, text) {
  try {
    await user.send({ content: text });
    return true;
  } catch (error) {
    console.error('❌ Failed to send automod DM warning:', error);
    return false;
  }
}

async function sendWarningNotice(message, reason, config) {
  const text = `⚠️ Your message was blocked in **${
    message.guild?.name || 'this server'
  }**: ${reason}`;

  if (config?.dmWarnings) {
    const sentDM = await safeWarnDM(message.author, text);

    if (sentDM) {
      return 'dm';
    }
  }

  const sentChannel = await safeWarnChannel(
    message,
    `⚠️ ${message.author}, your message was blocked: ${reason}`
  );

  return sentChannel ? 'channel' : 'none';
}

async function applyPunishment(
  message,
  type,
  reason,
  timeoutMinutes = 10,
  config = null
) {
  const punishments = normalizePunishments(type);
  const timeoutMs = Number(timeoutMinutes || 10) * 60 * 1000;
  const applied = [];
  let deleted = false;

  for (const punishment of punishments) {
    switch (punishment) {
      case 'delete': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        applied.push('delete');
        break;
      }

      case 'warn': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const warningMode = await sendWarningNotice(message, reason, config);
        applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        break;
      }

      case 'timeout': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const timedOut = await safeTimeout(
          message.member,
          timeoutMs,
          `Automod: ${reason}`
        );

        if (timedOut) {
          applied.push('timeout');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      case 'kick': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const kicked = await safeKick(message.member, `Automod: ${reason}`);

        if (kicked) {
          applied.push('kick');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      case 'ban': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const banned = await safeBan(message.member, `Automod: ${reason}`);

        if (banned) {
          applied.push('ban');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      default: {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        applied.push('delete');
        break;
      }
    }
  }

  return [...new Set(applied)].join(', ');
}

function formatAutomodActions(action) {
  const actions = String(action || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const labels = {
    delete: 'Message deleted',
    warn: 'User warned in channel',
    'warn-dm': 'User warned by DM',
    timeout: 'User timed out',
    kick: 'User kicked',
    ban: 'User banned',
  };

  return actions.map((entry) => labels[entry] || entry).join('\n');
}

async function sendAutomodLog(message, config, details) {
  if (!message?.guild) return;
  if (!config?.logs?.enabled) return;

  const colors = {
    'Anti-Link': '#e74c3c',
    'Caps Abuse': '#f39c12',
    'Bad Words': '#c0392b',
    'Anti-Spam': '#9b59b6',
    'Repeated Messages': '#8e44ad',
    'Anti-Invite': '#3498db',
    'Blacklisted Domain': '#c0392b',
    'Suspicious Domain': '#e67e22',
  };

  const emojis = {
    'Anti-Link': '🔗',
    'Caps Abuse': '🔠',
    'Bad Words': '🚫',
    'Anti-Spam': '📨',
    'Repeated Messages': '🔁',
    'Anti-Invite': '📩',
    'Blacklisted Domain': '⛔',
    'Suspicious Domain': '⚠️',
  };

  const severities = {
    'Anti-Link': 'High',
    'Blacklisted Domain': 'Critical',
    'Suspicious Domain': 'High',
    'Caps Abuse': 'Medium',
    'Bad Words': 'High',
    'Anti-Spam': 'Medium',
    'Repeated Messages': 'Low',
    'Anti-Invite': 'High',
  };

  await logService.send(message.guild, LOG_TYPES.AUTOMOD_ACTION, {
    color: colors[details.rule] || '#ff5555',
    title: `${emojis[details.rule] || '🛡️'} AutoMod: ${
      details.rule || 'Triggered'
    }`,
    user: message.author,
    reason: details.reason || 'No reason provided',
    fields: [
      {
        name: 'Channel',
        value: `${message.channel}`,
        inline: true,
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
        value: severities[details.rule] || 'Medium',
        inline: true,
      },
      {
        name: 'Message Content',
        value:
          details.content && details.content.length > 1024
            ? `${details.content.slice(0, 1021)}...`
            : details.content || 'N/A',
      },
    ],
  });
}

function isAllowedDomain(content, allowedDomains = []) {
  if (!allowedDomains.length) return false;

  const lowered = content.toLowerCase();

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
      const cleanBlocked = String(blocked).toLowerCase().trim();

      return domain === cleanBlocked || domain.endsWith(`.${cleanBlocked}`);
    })
  );
}

function isSuspiciousDomain(domain) {
  const suspiciousTLDs = [
    '.ru',
    '.xyz',
    '.tk',
    '.to',
    '.biz',
    '.info',
    '.click',
  ];

  return suspiciousTLDs.some((tld) => domain.endsWith(tld));
}

function hasBadReputation(content) {
  const domains = extractDomains(content);
  return domains.some((domain) => isSuspiciousDomain(domain));
}

function checkAntiLink(content, config) {
  if (!config?.antiLink?.enabled) return null;
  if (!hasSuspiciousLinkBehaviour(content)) return null;

  if (isBlockedDomain(content, config.antiLink.blockedDomains)) {
    return {
      rule: 'Blacklisted Domain',
      reason: 'This domain is explicitly blocked.',
      punishments:
        config.antiLink.punishments || [config.antiLink.punishment || 'delete'],
      timeoutMinutes: config.antiLink.timeoutMinutes || 10,
    };
  }

  if (hasBadReputation(content)) {
    return {
      rule: 'Suspicious Domain',
      reason: 'Domain has a suspicious reputation.',
      punishments:
        config.antiLink.punishments || [config.antiLink.punishment || 'delete'],
      timeoutMinutes: config.antiLink.timeoutMinutes || 10,
    };
  }

  if (isAllowedDomain(content, config.antiLink.allowedDomains)) {
    return null;
  }

  return {
    rule: 'Anti-Link',
    reason: 'Suspicious or blocked link detected.',
    punishments:
      config.antiLink.punishments || [config.antiLink.punishment || 'delete'],
    timeoutMinutes: config.antiLink.timeoutMinutes || 10,
  };
}

function checkAntiInvite(content, config) {
  if (!config?.antiInvite?.enabled) return null;
  if (!INVITE_REGEX.test(content)) return null;

  return {
    rule: 'Anti-Invite',
    reason: 'Discord invite links are not allowed.',
    punishments:
      config.antiInvite.punishments || [
        config.antiInvite.punishment || 'delete',
      ],
    timeoutMinutes: config.antiInvite.timeoutMinutes || 10,
  };
}

function checkCapsAbuse(content, config) {
  if (!config?.capsAbuse?.enabled) return null;

  const minLength = Number(config.capsAbuse.minLength || 10);
  const threshold = Number(config.capsAbuse.percentage || 70);

  const lettersOnly = content.replace(/[^a-zA-Z]/g, '');
  if (lettersOnly.length < minLength) return null;

  const upperCount = lettersOnly
    .split('')
    .filter((char) => char === char.toUpperCase()).length;

  const percentage = (upperCount / lettersOnly.length) * 100;

  if (percentage < threshold) return null;

  return {
    rule: 'Caps Abuse',
    reason: `Too many capital letters (${Math.round(percentage)}%).`,
    punishments:
      config.capsAbuse.punishments || [
        config.capsAbuse.punishment || 'delete',
      ],
    timeoutMinutes: config.capsAbuse.timeoutMinutes || 10,
  };
}

function checkBadWords(content, config) {
  if (!config?.badWords?.enabled) return null;

  const words = Array.isArray(config.badWords.words) ? config.badWords.words : [];
  if (!words.length) return null;

  const lowered = content.toLowerCase();

  const matched = words.find((word) => {
    const clean = String(word || '').trim().toLowerCase();
    return clean && lowered.includes(clean);
  });

  if (!matched) return null;

  return {
    rule: 'Bad Words',
    reason: `Blocked word detected: ${matched}`,
    punishments:
      config.badWords.punishments || [config.badWords.punishment || 'delete'],
    timeoutMinutes: config.badWords.timeoutMinutes || 10,
  };
}

function checkRepeatedMessages(message, config) {
  if (!config?.repeatedMessages?.enabled) return null;

  const key = getMemberKey(message);
  const content = normalizeMessage(message.content);
  const maxRepeats = Number(config.repeatedMessages.maxRepeats || 3);
  const intervalSeconds = Number(config.repeatedMessages.intervalSeconds || 10);

  if (!content) return null;

  const entry = repeatTracker.get(key) || {
    lastContent: null,
    count: 0,
    updatedAt: 0,
  };

  const currentTime = now();

  if (
    entry.lastContent === content &&
    currentTime - entry.updatedAt <= intervalSeconds * 1000
  ) {
    entry.count += 1;
  } else {
    entry.lastContent = content;
    entry.count = 1;
  }

  entry.updatedAt = currentTime;
  repeatTracker.set(key, entry);

  if (entry.count < maxRepeats) return null;

  return {
    rule: 'Repeated Messages',
    reason: `Same message repeated ${entry.count} times.`,
    punishments:
      config.repeatedMessages.punishments || [
        config.repeatedMessages.punishment || 'delete',
      ],
    timeoutMinutes: config.repeatedMessages.timeoutMinutes || 10,
  };
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
  const intervalSeconds = Number(config.antiSpam.intervalSeconds || 8);
  const cutoff = now() - intervalSeconds * 1000;

  const entries = spamTracker.get(key) || [];
  const filtered = entries.filter((timestamp) => timestamp >= cutoff);

  filtered.push(now());
  spamTracker.set(key, filtered);

  if (filtered.length >= maxMessages) {
    return {
      rule: 'Anti-Spam',
      reason: `${filtered.length} messages sent in ${intervalSeconds} seconds.`,
      punishments:
        config.antiSpam.punishments || [config.antiSpam.punishment || 'delete'],
      timeoutMinutes: config.antiSpam.timeoutMinutes || 10,
    };
  }

  const nonEmptyLineCount = getNonEmptyLineCount(message.content);

  if (nonEmptyLineCount >= maxMessages) {
    return {
      rule: 'Anti-Spam',
      reason: `${nonEmptyLineCount} message lines sent in a single message.`,
      punishments:
        config.antiSpam.punishments || [config.antiSpam.punishment || 'delete'],
      timeoutMinutes: config.antiSpam.timeoutMinutes || 10,
    };
  }

  return null;
}

function cleanupTrackers() {
  const cutoff = now() - 10 * 60 * 1000;

  for (const [key, timestamps] of spamTracker.entries()) {
    const fresh = timestamps.filter((timestamp) => timestamp >= cutoff);

    if (fresh.length) spamTracker.set(key, fresh);
    else spamTracker.delete(key);
  }

  for (const [key, entry] of repeatTracker.entries()) {
    if (entry.updatedAt < cutoff) {
      repeatTracker.delete(key);
    }
  }
}

setInterval(cleanupTrackers, 60 * 1000).unref();

async function runAutomod(message) {
  if (!message.guild) return { blocked: false };
  if (!message.content) return { blocked: false };

  if (!guildStore.isModuleEnabled(message.guild.id, 'automod')) {
    return { blocked: false };
  }

  const config = getGuildAutoModConfig(message.guild.id);
  if (!config) return { blocked: false };
  if (hasBypass(message, config)) return { blocked: false };

  const checks = [
    checkAntiInvite(message.content, config),
    checkAntiLink(message.content, config),
    checkCapsAbuse(message.content, config),
    checkBadWords(message.content, config),
    checkRepeatedMessages(message, config),
    checkAntiSpam(message, config),
  ];

  const hit = checks.find(Boolean);
  if (!hit) return { blocked: false };

  const action = await applyPunishment(
    message,
    hit.punishments,
    hit.reason,
    hit.timeoutMinutes,
    config
  );

  await sendAutomodLog(message, config, {
    rule: hit.rule,
    reason: hit.reason,
    action,
    content: message.content,
  });

  return {
    blocked: true,
    rule: hit.rule,
    reason: hit.reason,
    action,
  };
}

module.exports = {
  getDefaultConfig,
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,
  runAutomod,
};