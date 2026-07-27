'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const { handlePrefixCommand } = require('../../features/prefix/prefixRouter');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');
const guildManager = require('../../core/guild/guildManager');
const { applyPunishmentEngine } = require('../../core/automod/punishmentEngine');

const spamWindows = new Map();

async function runHandler(label, handler, ...args) {
  try {
    return await handler(...args);
  } catch (error) {
    console.error(`[MessageCreate] ${label} handler failed:`, error?.stack || error?.message || error);
    return null;
  }
}

function getAutoModConfig(guildId) {
  const config = guildManager.getGuildSection(guildId, 'automod', {}) || {};
  return {
    enabled: config.enabled === true,
    ignoredRoles: Array.isArray(config.ignoredRoles) ? config.ignoredRoles : [],
    ignoredChannels: Array.isArray(config.ignoredChannels) ? config.ignoredChannels : [],
    antiSpam: {
      enabled: config.antiSpam?.enabled === true,
      maxMessages: Math.max(2, Number(config.antiSpam?.maxMessages || 5)),
      intervalSeconds: Math.max(1, Number(config.antiSpam?.intervalSeconds || 10)),
      actions: Array.isArray(config.antiSpam?.actions)
        ? config.antiSpam.actions
        : [config.antiSpam?.action || 'delete'],
    },
  };
}

function isIgnored(message, config) {
  if (config.ignoredChannels.includes(message.channelId)) return true;
  const roleIds = message.member?.roles?.cache ? [...message.member.roles.cache.keys()] : [];
  return roleIds.some((roleId) => config.ignoredRoles.includes(roleId));
}

async function handleAutoMod(message) {
  const config = getAutoModConfig(message.guild.id);
  if (!config.enabled || !config.antiSpam.enabled || isIgnored(message, config)) return false;

  const now = Date.now();
  const windowMs = config.antiSpam.intervalSeconds * 1000;
  const key = `${message.guild.id}:${message.author.id}`;
  const previous = spamWindows.get(key) || [];
  const timestamps = previous.filter((timestamp) => now - timestamp <= windowMs);
  timestamps.push(now);
  spamWindows.set(key, timestamps);

  if (timestamps.length < config.antiSpam.maxMessages) return false;

  spamWindows.delete(key);

  await applyPunishmentEngine(
    { message, member: message.member, user: message.author, guild: message.guild, channel: message.channel },
    {
      punishments: config.antiSpam.actions,
      rule: 'Spam Protection',
      reason: `${timestamps.length} messages sent within ${config.antiSpam.intervalSeconds} seconds`,
      source: 'automod',
      messageContent: message.content,
    }
  );

  return true;
}

module.exports = {
  name: Events.MessageCreate,

  async execute(message, client) {
    if (!message.guild || !message.member) return;
    if (!message.content || message.author?.bot) return;

    const autoModHandled = await runHandler('AutoMod', handleAutoMod, message);
    if (autoModHandled) return;

    await runHandler('Stats', statsManager.handleMessageCreate, message);
    await runHandler('Leveling', levelingTracking.handleMessageCreate, message);

    const handledPrefixCommand = await runHandler('Prefix Command', handlePrefixCommand, message, client);
    if (handledPrefixCommand) return;

    await runHandler('Translation', translationThreadManager.handleMessageCreate, message, client);
    await runHandler('Sticky', handleStickyMessage, message, client);
  },
};