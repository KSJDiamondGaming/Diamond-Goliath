const { PermissionFlagsBits } = require('discord.js');
const { getGuildAutoModConfig } = require('../../utils/automod/automodStore');
const { addPunishment } = require('../../utils/tempPunishmentsStore');
const logModerationAction = require('../../utils/logging/ModerationActionLog');

const spamTracker = new Map();
const repeatTracker = new Map();

const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/gi;

const URL_REGEX =
  /https?:\/\/[^\s]+|(?:^|\s)([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

function now() {
  return Date.now();
}

function normalizeContent(content) {
  return String(content || '').trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDomainFromUrl(raw) {
  if (!raw) return null;

  const candidate =
    raw.startsWith('http://') || raw.startsWith('https://')
      ? raw
      : `https://${raw.trim()}`;

  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isAllowedDomain(match, allowedDomains = []) {
  const domain = getDomainFromUrl(match);
  if (!domain) return false;

  return allowedDomains.some((allowed) => {
    const normalized = String(allowed).trim().toLowerCase().replace(/^www\./, '');
    return domain === normalized || domain.endsWith(`.${normalized}`);
  });
}

function pruneTimestamps(list, windowMs) {
  const cutoff = now() - windowMs;
  return list.filter((entry) => entry.timestamp >= cutoff);
}

function shouldIgnoreMessage(message, config) {
  if (!message.guild || !message.member) return true;
  if (!config.enabled) return true;
  if (message.author.id === message.client.user.id) return true;
  if (config.ignoreBots && message.author.bot) return true;
  if (config.ignoredChannelIds.includes(message.channel.id)) return true;
  if (config.ignoredUserIds.includes(message.author.id)) return true;

  if (
    config.ignoredRoleIds.length &&
    message.member.roles.cache.some((role) => config.ignoredRoleIds.includes(role.id))
  ) {
    return true;
  }

  if (
    config.ignoreAdmins &&
    (message.member.permissions.has(PermissionFlagsBits.Administrator) ||
      message.guild.ownerId === message.author.id)
  ) {
    return true;
  }

  return false;
}

function detectSpam(message, config) {
  if (!config.antiSpam.enabled) return null;

  const key = `${message.guild.id}:${message.author.id}`;
  const windowMs = config.rules.antiSpam.intervalMs;

  const entries = pruneTimestamps(spamTracker.get(key) || [], windowMs);
  entries.push({ timestamp: now() });
  spamTracker.set(key, entries);

  if (entries.length >= config.antiSpam.maxMessages) {
    return {
      rule: 'Anti Spam',
      punishment: config.antiSpam.punishment,
      timeoutMinutes: config.antiSpam.timeoutMinutes,
      reason: `Sent ${entries.length} messages in ${config.antiSpam.intervalSeconds} seconds.`,
      matchedContent: null,
    };
  }

  return null;
}

function detectRepeatedMessages(message, config) {
  if (!config.repeatedMessages.enabled) return null;

  const content = normalizeContent(message.content);
  if (!content) return null;

  const key = `${message.guild.id}:${message.author.id}`;
  const windowMs = config.rules.repeatedMessages.intervalMs;

  const entries = pruneTimestamps(repeatTracker.get(key) || [], windowMs);
  entries.push({ timestamp: now(), content });
  repeatTracker.set(key, entries);

  const sameContentCount = entries.filter((entry) => entry.content === content).length;

  if (sameContentCount >= config.repeatedMessages.maxRepeats) {
    return {
      rule: 'Repeated Messages',
      punishment: config.repeatedMessages.punishment,
      timeoutMinutes: config.repeatedMessages.timeoutMinutes,
      reason: `Repeated the same message ${sameContentCount} times in ${config.repeatedMessages.intervalSeconds} seconds.`,
      matchedContent: message.content.slice(0, 500),
    };
  }

  return null;
}

function detectInvite(message, config) {
  if (!config.antiInvite.enabled) return null;
  if (!message.content) return null;

  const match = message.content.match(INVITE_REGEX);
  if (!match) return null;

  return {
    rule: 'Anti Invite',
    punishment: config.antiInvite.punishment,
    timeoutMinutes: config.antiInvite.timeoutMinutes,
    reason: 'Posted a Discord invite link.',
    matchedContent: match[0],
  };
}

function detectLink(message, config) {
  if (!config.antiLink.enabled) return null;
  if (!message.content) return null;

  const matches = [...message.content.matchAll(URL_REGEX)].map((m) => m[0].trim());
  if (!matches.length) return null;

  const blocked = matches.find(
    (match) => !isAllowedDomain(match, config.antiLink.allowedDomains)
  );
  if (!blocked) return null;

  return {
    rule: 'Anti Link',
    punishment: config.antiLink.punishment,
    timeoutMinutes: config.antiLink.timeoutMinutes,
    reason: 'Posted a blocked link/domain.',
    matchedContent: blocked,
  };
}

function detectCaps(message, config) {
  if (!config.capsAbuse.enabled) return null;
  if (!message.content) return null;

  const letters = message.content.match(/[a-z]/gi) || [];
  if (letters.length < config.capsAbuse.minLength) return null;

  const uppercase = (message.content.match(/[A-Z]/g) || []).length;
  const percentage = Math.round((uppercase / letters.length) * 100);

  if (percentage >= config.capsAbuse.percentage) {
    return {
      rule: 'Caps Abuse',
      punishment: config.capsAbuse.punishment,
      timeoutMinutes: config.capsAbuse.timeoutMinutes,
      reason: `Message was ${percentage}% uppercase.`,
      matchedContent: message.content.slice(0, 500),
    };
  }

  return null;
}

function detectBadWords(message, config) {
  if (!config.badWords.enabled) return null;
  if (!message.content) return null;
  if (!config.badWords.words.length) return null;

  const lowered = message.content.toLowerCase();

  const matchedWord = config.badWords.words.find((word) => {
    const clean = String(word).trim().toLowerCase();
    if (!clean) return false;

    const regex = new RegExp(`\\b${escapeRegExp(clean)}\\b`, 'i');
    return regex.test(lowered);
  });

  if (!matchedWord) return null;

  return {
    rule: 'Bad Words',
    punishment: config.badWords.punishment,
    timeoutMinutes: config.badWords.timeoutMinutes,
    reason: `Used blocked word: ${matchedWord}`,
    matchedContent: matchedWord,
  };
}

async function safeDelete(message) {
  if (!message.deletable) return false;

  try {
    await message.delete();
    return true;
  } catch {
    return false;
  }
}

async function safeTimeout(member, minutes) {
  if (!member.moderatable) return false;

  try {
    await member.timeout(minutes * 60 * 1000, 'AutoMod timeout');
    return true;
  } catch {
    return false;
  }
}

async function safeKick(member, reason) {
  if (!member.kickable) return false;

  try {
    await member.kick(reason);
    return true;
  } catch {
    return false;
  }
}

async function safeBan(member, reason) {
  if (!member.bannable) return false;

  try {
    await member.ban({ reason });
    return true;
  } catch {
    return false;
  }
}

async function sendAutoModLog(message, config, trigger, outcome) {
  if (!config.logs.enabled || !config.logs.channelId) return;

  try {
    const channel = await message.guild.channels.fetch(config.logs.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const lines = [
      `🛡️ **AutoMod Triggered**`,
      `**Rule:** ${trigger.rule}`,
      `**User:** ${message.author.tag} (${message.author.id})`,
      `**Channel:** <#${message.channel.id}>`,
      `**Action:** ${outcome}`,
      `**Reason:** ${trigger.reason}`,
    ];

    if (trigger.matchedContent) {
      lines.push(`**Match:** ${String(trigger.matchedContent).slice(0, 500)}`);
    }

    await channel.send({ content: lines.join('\n') });
  } catch (error) {
    console.error('Failed to send automod log:', error);
  }
}

async function applyPunishment(message, config, trigger) {
  const member = message.member;
  const baseReason = `[AutoMod] ${trigger.rule}: ${trigger.reason}`;
  let deleted = false;
  let outcome = 'No action taken';

  if (trigger.punishment === 'delete') {
    deleted = await safeDelete(message);
    outcome = deleted ? 'Message deleted' : 'Delete failed';
  }

  if (trigger.punishment === 'warn') {
    deleted = await safeDelete(message);
    outcome = deleted ? 'Warned + deleted message' : 'Warned';

    try {
      await message.author.send(
        `You were warned in **${message.guild.name}** by AutoMod.\nRule: **${trigger.rule}**\nReason: **${trigger.reason}**`
      );
    } catch {}

    await logModerationAction({
      guild: message.guild,
      action: 'Warn',
      user: message.author,
      moderator: null,
      reason: `[AutoMod] ${trigger.rule}: ${trigger.reason}`,
      color: '#f39c12',
    });
  }

  if (trigger.punishment === 'timeout') {
    deleted = await safeDelete(message);
    const timedOut = await safeTimeout(member, trigger.timeoutMinutes);

    if (timedOut) {
      addPunishment({
        userId: message.author.id,
        guildId: message.guild.id,
        type: 'mute',
        expiresAt: Date.now() + trigger.timeoutMinutes * 60 * 1000,
      });
    }

    outcome = timedOut
      ? `Timed out for ${trigger.timeoutMinutes} minute(s)`
      : 'Timeout failed';

    if (timedOut) {
      await logModerationAction({
        guild: message.guild,
        action: 'Timeout',
        user: message.author,
        moderator: null,
        reason: `[AutoMod] ${trigger.rule}: ${trigger.reason}`,
        duration: `${trigger.timeoutMinutes} minute(s)`,
        color: '#e67e22',
      });
    }
  }

  if (trigger.punishment === 'kick') {
    deleted = await safeDelete(message);
    const kicked = await safeKick(member, baseReason);
    outcome = kicked ? 'Kicked user' : 'Kick failed';

    if (kicked) {
      await logModerationAction({
        guild: message.guild,
        action: 'Kick',
        user: message.author,
        moderator: null,
        reason: `[AutoMod] ${trigger.rule}: ${trigger.reason}`,
        color: '#e74c3c',
      });
    }
  }

  if (trigger.punishment === 'ban') {
    deleted = await safeDelete(message);
    const banned = await safeBan(member, baseReason);
    outcome = banned ? 'Banned user' : 'Ban failed';

    if (banned) {
      await logModerationAction({
        guild: message.guild,
        action: 'Ban',
        user: message.author,
        moderator: null,
        reason: `[AutoMod] ${trigger.rule}: ${trigger.reason}`,
        color: '#c0392b',
      });
    }
  }

  if (!deleted && ['timeout', 'kick', 'ban'].includes(trigger.punishment)) {
    await safeDelete(message);
  }

  await sendAutoModLog(message, config, trigger, outcome);
}

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    if (!message.guild || !message.author) return;
    if (!message.member) return;

    const config = getGuildAutoModConfig(message.guild.id);
    if (shouldIgnoreMessage(message, config)) return;

    const trigger =
      detectInvite(message, config) ||
      detectLink(message, config) ||
      detectBadWords(message, config) ||
      detectCaps(message, config) ||
      detectRepeatedMessages(message, config) ||
      detectSpam(message, config);

    if (!trigger) return;

    await applyPunishment(message, config, trigger);
  },
};