const INVITE_REGEX =
  /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

const URL_REGEX =
  /((https?:\/\/)|(www\.))?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}([^\s]*)/i;

const spamTracker = new Map();
const repeatTracker = new Map();

function now() {
  return Date.now();
}

function normalizeMessage(content) {
  return String(content || '').trim().toLowerCase();
}

function getMemberKey(message) {
  return `${message.guild.id}:${message.author.id}`;
}

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
  return ['.ru', '.xyz', '.tk', '.to', '.biz', '.info', '.click'].some((tld) =>
    domain.endsWith(tld)
  );
}

function hasBadReputation(content) {
  return extractDomains(content).some((domain) => isSuspiciousDomain(domain));
}

function checkAntiInvite(content, config) {
  if (!config?.antiInvite?.enabled) return null;
  if (!INVITE_REGEX.test(content)) return null;

  return {
    rule: 'Anti-Invite',
    reason: 'Discord invite links are not allowed.',
    punishments: config.antiInvite.punishments || ['delete'],
    timeoutMinutes: config.antiInvite.timeoutMinutes || 10,
  };
}

function checkAntiLink(content, config) {
  if (!config?.antiLink?.enabled) return null;
  if (!hasSuspiciousLinkBehaviour(content)) return null;

  if (isBlockedDomain(content, config.antiLink.blockedDomains)) {
    return {
      rule: 'Blacklisted Domain',
      reason: 'This domain is explicitly blocked.',
      punishments: config.antiLink.punishments || ['delete'],
      timeoutMinutes: config.antiLink.timeoutMinutes || 10,
    };
  }

  if (hasBadReputation(content)) {
    return {
      rule: 'Suspicious Domain',
      reason: 'Domain has a suspicious reputation.',
      punishments: config.antiLink.punishments || ['delete'],
      timeoutMinutes: config.antiLink.timeoutMinutes || 10,
    };
  }

  if (isAllowedDomain(content, config.antiLink.allowedDomains)) {
    return null;
  }

  return {
    rule: 'Anti-Link',
    reason: 'Suspicious or blocked link detected.',
    punishments: config.antiLink.punishments || ['delete'],
    timeoutMinutes: config.antiLink.timeoutMinutes || 10,
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
    punishments: config.capsAbuse.punishments || ['delete'],
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
    punishments: config.badWords.punishments || ['delete'],
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
    punishments: config.repeatedMessages.punishments || ['delete'],
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
      punishments: config.antiSpam.punishments || ['delete'],
      timeoutMinutes: config.antiSpam.timeoutMinutes || 10,
    };
  }

  const nonEmptyLineCount = getNonEmptyLineCount(message.content);

  if (nonEmptyLineCount >= maxMessages) {
    return {
      rule: 'Anti-Spam',
      reason: `${nonEmptyLineCount} message lines sent in a single message.`,
      punishments: config.antiSpam.punishments || ['delete'],
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

module.exports = {
  checkAntiInvite,
  checkAntiLink,
  checkCapsAbuse,
  checkBadWords,
  checkRepeatedMessages,
  checkAntiSpam,
};