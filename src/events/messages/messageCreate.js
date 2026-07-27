'use strict';

const { Events } = require('discord.js');
const { handleStickyMessage } = require('../../modules/messageStudio/sticky/stickyManager');
const { handlePrefixCommand } = require('../../features/prefix/prefixRouter');
const translationThreadManager = require('../../modules/utilityStudio/translation/translationThreadManager');
const statsManager = require('../../modules/utilityStudio/stats/statsManager');
const levelingTracking = require('../../modules/communityStudio/leveling/levelingTracking');
const guildManager = require('../../core/guild/guildManager');
const { applyPunishmentEngine, normalizePunishments } = require('../../core/automod/punishmentEngine');

const spamWindows = new Map();
const DEFAULT_SPAM_DM = '⚠️ **{server} AutoMod**\nSpam Protection triggered: {reason}';

async function runHandler(label, handler, ...args) {
  try {
    return await handler(...args);
  } catch (error) {
    console.error(`[MessageCreate] ${label} handler failed:`, error?.stack || error?.message || error);
    return null;
  }
}

function readAutomodSection(guildId) {
  try {
    const guildData = guildManager.getGuildData(guildId, { forceReload: true });
    return guildData?.modules?.automod || {};
  } catch (error) {
    console.error(`[AutoMod] Failed to read guild config for ${guildId}:`, error?.stack || error?.message || error);
    return {};
  }
}

function getAutoModConfig(guildId) {
  const config = readAutomodSection(guildId);
  const antiSpam = config.antiSpam || {};

  return {
    enabled: config.enabled === true,
    dmUser: config.dmUser !== false,
    dmMessages: {
      antiSpam: String(config.dmMessages?.antiSpam || DEFAULT_SPAM_DM),
    },
    ignoredRoles: Array.isArray(config.ignoredRoles) ? config.ignoredRoles.map(String) : [],
    ignoredChannels: Array.isArray(config.ignoredChannels) ? config.ignoredChannels.map(String) : [],
    antiSpam: {
      enabled: antiSpam.enabled === true,
      maxMessages: Math.min(100, Math.max(2, Number.parseInt(antiSpam.maxMessages, 10) || 5)),
      intervalSeconds: Math.min(3600, Math.max(1, Number.parseInt(antiSpam.intervalSeconds, 10) || 10)),
      actions: normalizePunishments(antiSpam.actions || antiSpam.action || ['delete']),
    },
  };
}

function isIgnored(message, config) {
  if (config.ignoredChannels.includes(String(message.channelId))) return true;
  const roleIds = message.member?.roles?.cache ? [...message.member.roles.cache.keys()].map(String) : [];
  return roleIds.some((roleId) => config.ignoredRoles.includes(roleId));
}

function renderDmMessage(template, message, reason) {
  return String(template || DEFAULT_SPAM_DM)
    .replaceAll('{server}', message.guild.name)
    .replaceAll('{reason}', reason)
    .replaceAll('{user}', message.author.username)
    .replaceAll('{userMention}', `<@${message.author.id}>`)
    .replaceAll('{channel}', message.channel?.name || 'unknown-channel');
}

async function fallbackNotify(message, config, result, reason) {
  const actions = config.antiSpam.actions;

  if (actions.includes('warn') && !result?.applied?.includes('warn')) {
    const warning = await message.channel.send({
      content: `⚠️ ${message.author}, your message was blocked by **Spam Protection**: ${reason}`,
    }).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => null), 10000);
  }

  if (actions.includes('dm') && config.dmUser && !result?.applied?.includes('dm')) {
    await message.author.send({
      content: renderDmMessage(config.dmMessages.antiSpam, message, reason),
    }).catch(() => null);
  }

  if (actions.includes('delete') && !result?.applied?.includes('delete') && message.deletable) {
    await message.delete().catch(() => null);
  }
}

async function handleAutoMod(message) {
  const config = getAutoModConfig(message.guild.id);
  if (!config.enabled || !config.antiSpam.enabled || isIgnored(message, config)) return false;

  const now = Date.now();
  const windowMs = config.antiSpam.intervalSeconds * 1000;
  const key = `${message.guild.id}:${message.author.id}`;
  const timestamps = (spamWindows.get(key) || []).filter((timestamp) => now - timestamp <= windowMs);
  timestamps.push(now);
  spamWindows.set(key, timestamps);

  if (timestamps.length < config.antiSpam.maxMessages) return false;

  spamWindows.delete(key);
  const reason = `${timestamps.length} messages sent within ${config.antiSpam.intervalSeconds} seconds`;

  console.log(`[AutoMod] Spam triggered guild=${message.guild.id} user=${message.author.id} count=${timestamps.length}/${config.antiSpam.maxMessages} actions=${config.antiSpam.actions.join(',')}`);

  let result = null;
  try {
    result = await applyPunishmentEngine(
      { message, member: message.member, user: message.author, guild: message.guild, channel: message.channel },
      {
        punishments: config.antiSpam.actions,
        rule: 'Spam Protection',
        reason,
        source: 'automod',
        messageContent: message.content,
        dmMessage: renderDmMessage(config.dmMessages.antiSpam, message, reason),
      }
    );
  } catch (error) {
    console.error('[AutoMod] Spam punishment engine failed:', error?.stack || error?.message || error);
  }

  await fallbackNotify(message, config, result, reason);
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
