const { PermissionFlagsBits } = require('discord.js');
const { getGuildAutoModConfig, AUTOMOD_PATH } = require('./automodStore');

const spamCache = new Map();
const repeatCache = new Map();

const INVITE_REGEX = /(https?:\/\/)?(www\.)?(discord\.gg|discord(app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;
const URL_REGEX = /\b((https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?)\b/i;

function normalizeContent(content = '') {
  return String(content).toLowerCase().replace(/\s+/g, ' ').trim();
}

function getCapsPercentage(content = '') {
  const letters = String(content).replace(/[^a-zA-Z]/g, '');
  if (!letters.length) return 0;

  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  return (uppercase / letters.length) * 100;
}

function getCacheKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function pruneEntries(entries = [], windowMs = 0) {
  const now = Date.now();
  return entries.filter((entry) => now - entry.createdAt <= windowMs);
}

function shouldIgnoreMessage(message, config) {
  if (!message.guild || !message.member) return true;
  if (config.ignoreBots && message.author.bot) return true;

  if (
    config.ignoreAdmins &&
    message.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  if (config.ignoredChannelIds.includes(message.channel.id)) {
    return true;
  }

  if (config.ignoredUserIds.includes(message.author.id)) {
    return true;
  }

  if (
    message.member.roles?.cache?.some((role) =>
      config.ignoredRoleIds.includes(role.id)
    )
  ) {
    return true;
  }

  return false;
}

function buildResult(ruleKey, reason, punishment, timeoutMinutes = 10, extra = {}) {
  return {
    matched: true,
    rule: ruleKey,
    reason,
    punishment,
    timeoutMinutes,
    ...extra,
  };
}

function checkAntiSpam(message, config) {
  const rule = config.rules?.antiSpam || config.antiSpam;
  if (!rule?.enabled) return null;

  const key = getCacheKey(message.guild.id, message.author.id);
  const current = spamCache.get(key) || [];
  const next = pruneEntries(current, rule.intervalMs || 8000);

  next.push({
    content: normalizeContent(message.content),
    createdAt: Date.now(),
    messageId: message.id,
  });

  spamCache.set(key, next);

  console.log('[AUTOMOD][SPAM]', {
    path: AUTOMOD_PATH,
    user: message.author.tag,
    guildId: message.guild.id,
    count: next.length,
    maxMessages: rule.maxMessages,
    intervalMs: rule.intervalMs,
    punishment: rule.punishment,
    content: message.content,
  });

  if (next.length >= rule.maxMessages) {
    spamCache.delete(key);

    return buildResult(
      'antiSpam',
      `Sent ${next.length} messages in ${rule.intervalSeconds} seconds`,
      rule.punishment,
      rule.timeoutMinutes,
      {
        deleteMessage: ['delete', 'warn', 'timeout', 'kick', 'ban'].includes(rule.punishment),
      }
    );
  }

  return null;
}

function checkRepeatedMessages(message, config) {
  const rule = config.rules?.repeatedMessages || config.repeatedMessages;
  if (!rule?.enabled) return null;

  const key = getCacheKey(message.guild.id, message.author.id);
  const entries = pruneEntries(repeatCache.get(key) || [], rule.intervalMs || 10000);
  const content = normalizeContent(message.content);
  if (!content) return null;

  entries.push({
    content,
    createdAt: Date.now(),
    messageId: message.id,
  });

  repeatCache.set(key, entries);

  const repeats = entries.filter((entry) => entry.content === content).length;

  console.log('[AUTOMOD][REPEAT]', {
    user: message.author.tag,
    guildId: message.guild.id,
    content,
    repeats,
    maxRepeats: rule.maxRepeats,
    intervalMs: rule.intervalMs,
  });

  if (repeats >= rule.maxRepeats) {
    repeatCache.delete(key);

    return buildResult(
      'repeatedMessages',
      `Repeated the same message ${repeats} times in ${rule.intervalSeconds} seconds`,
      rule.punishment,
      rule.timeoutMinutes,
      {
        deleteMessage: ['delete', 'warn', 'timeout', 'kick', 'ban'].includes(rule.punishment),
      }
    );
  }

  return null;
}

function checkAntiInvite(message, config) {
  const rule = config.rules?.antiInvite || config.antiInvite;
  if (!rule?.enabled) return null;
  if (!message.content) return null;

  if (INVITE_REGEX.test(message.content)) {
    return buildResult(
      'antiInvite',
      'Discord invite link detected',
      rule.punishment,
      rule.timeoutMinutes,
      { deleteMessage: true }
    );
  }

  return null;
}

function checkAntiLink(message, config) {
  const rule = config.rules?.antiLink || config.antiLink;
  if (!rule?.enabled) return null;
  if (!message.content) return null;
  if (!URL_REGEX.test(message.content)) return null;

  const content = message.content.toLowerCase();
  const allowedDomains = Array.isArray(rule.allowedDomains) ? rule.allowedDomains : [];

  const isAllowed = allowedDomains.some((domain) => {
    const normalizedDomain = String(domain).trim().toLowerCase();
    return normalizedDomain && content.includes(normalizedDomain);
  });

  if (isAllowed) return null;

  return buildResult(
    'antiLink',
    'Unauthorized link detected',
    rule.punishment,
    rule.timeoutMinutes,
    { deleteMessage: true }
  );
}

function checkCapsAbuse(message, config) {
  const rule = config.rules?.capsAbuse || config.capsAbuse;
  if (!rule?.enabled) return null;
  if (!message.content) return null;
  if (message.content.length < rule.minLength) return null;

  const capsPercentage = getCapsPercentage(message.content);

  if (capsPercentage >= rule.percentage) {
    return buildResult(
      'capsAbuse',
      `Excessive caps detected (${Math.round(capsPercentage)}%)`,
      rule.punishment,
      rule.timeoutMinutes,
      {
        deleteMessage: ['delete', 'warn', 'timeout', 'kick', 'ban'].includes(rule.punishment),
      }
    );
  }

  return null;
}

function checkBadWords(message, config) {
  const rule = config.rules?.badWords || config.badWords;
  if (!rule?.enabled) return null;
  if (!message.content) return null;

  const content = normalizeContent(message.content);
  const words = Array.isArray(rule.words) ? rule.words : [];

  for (const word of words) {
    const normalizedWord = normalizeContent(word);

    if (normalizedWord && content.includes(normalizedWord)) {
      return buildResult(
        'badWords',
        `Blocked word detected: ${word}`,
        rule.punishment,
        rule.timeoutMinutes,
        {
          deleteMessage: true,
          matchedWord: word,
        }
      );
    }
  }

  return null;
}

async function runAutomod(message) {
  console.log('[AUTOMOD] runAutomod called', {
    guild: message.guild?.id,
    user: message.author?.tag,
    content: message.content,
  });

  if (!message.guild || !message.member) return null;

  const config = getGuildAutoModConfig(message.guild.id);

  console.log('[AUTOMOD][LOAD]', {
    path: AUTOMOD_PATH,
    guildId: message.guild.id,
    enabled: config.enabled,
    ignoreBots: config.ignoreBots,
    ignoreAdmins: config.ignoreAdmins,
    antiSpam: config.antiSpam,
    antiSpamComputed: config.rules?.antiSpam,
  });

  if (!config.enabled) return null;

  if (shouldIgnoreMessage(message, config)) {
    console.log('[AUTOMOD][SKIP]', {
      user: message.author.tag,
      isAdmin: message.member.permissions.has(PermissionFlagsBits.Administrator),
      channelId: message.channel.id,
    });
    return null;
  }

  if (!message.content?.trim()) return null;

  const checks = [
    () => checkAntiSpam(message, config),
    () => checkRepeatedMessages(message, config),
    () => checkAntiInvite(message, config),
    () => checkAntiLink(message, config),
    () => checkCapsAbuse(message, config),
    () => checkBadWords(message, config),
  ];

  for (const check of checks) {
    const result = check();
    if (result?.matched) {
      console.log('[AUTOMOD][MATCH]', result);
      return {
        ...result,
        config,
      };
    }
  }

  return null;
}

module.exports = {
  runAutomod,
  normalizeContent,
  getCapsPercentage,
};