const { PermissionFlagsBits } = require('discord.js');
const { getGuildAutoModConfig } = require('../utils/automod/automodStore');

const {
  addPunishment,
} = require('../utils/logging/modlogs/tempPunishmentsStore');

const logModerationAction = require('../utils/logging/modlogs/moderationActionLog');

const INVITE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/gi;

const URL_REGEX =
  /https?:\/\/[^\s]+|(?:^|\s)([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

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

function shouldIgnoreMessage(message, config) {
  if (!message.guild || !message.member) return true;
  if (!config?.enabled) return true;
  if (!message.client.user) return true;
  if (message.author.id === message.client.user.id) return true;
  if (config.ignoreBots && message.author.bot) return true;
  if (config.ignoredChannelIds?.includes(message.channel.id)) return true;
  if (config.ignoredUserIds?.includes(message.author.id)) return true;

  if (
    config.ignoredRoleIds?.length &&
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

function detectInvite(message, config) {
  if (!config.antiInvite?.enabled) return null;

  const match = message.content?.match(INVITE_REGEX);
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
  if (!config.antiLink?.enabled) return null;

  const matches = [...(message.content?.matchAll(URL_REGEX) || [])].map((m) =>
    m[0].trim()
  );
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

async function tryDeleteMessage(message) {
  try {
    if (message.deletable) {
      await message.delete();
      return true;
    }
  } catch (error) {
    console.error('❌ AutoMod failed to delete message:', error);
  }

  return false;
}

async function applyPunishment(message, trigger) {
  const member = message.member;
  const baseReason = `[AutoMod] ${trigger.rule}: ${trigger.reason}`;
  const deleted = await tryDeleteMessage(message);

  if (trigger.punishment === 'warn') {
    await logModerationAction({
      guild: message.guild,
      action: 'Warn',
      user: message.author,
      moderator: null,
      reason: deleted ? `${baseReason} Message deleted.` : baseReason,
      color: '#f39c12',
    });

    return;
  }

  if (trigger.punishment === 'timeout') {
    const durationMs = Number(trigger.timeoutMinutes || 1) * 60 * 1000;

    try {
      await member.timeout(durationMs, baseReason);

      addPunishment({
        userId: message.author.id,
        guildId: message.guild.id,
        type: 'mute',
        expiresAt: Date.now() + durationMs,
      });

      await logModerationAction({
        guild: message.guild,
        action: 'Timeout',
        user: message.author,
        moderator: null,
        reason: deleted ? `${baseReason} Message deleted.` : baseReason,
        duration: `${trigger.timeoutMinutes}m`,
        color: '#e67e22',
      });
    } catch (error) {
      console.error('❌ AutoMod timeout failed:', error);
    }
  }
}

module.exports = {
  name: 'messageCreate',

  async execute(message) {
    try {
      if (!message.guild || !message.member) return;

      const config = getGuildAutoModConfig(message.guild.id);
      if (shouldIgnoreMessage(message, config)) return;

      const trigger =
        detectInvite(message, config) ||
        detectLink(message, config);

      if (!trigger) return;

      await applyPunishment(message, trigger);
    } catch (error) {
      console.error('❌ messageCreate handler failed:', error);
    }
  },
};