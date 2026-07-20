const { PermissionsBitField } = require('discord.js');
const guildStore = require('../guild/guildManager');

const {
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
  updateGuildAutoModConfig,
  resetGuildAutoModConfig,
  getDefaultConfig,
} = require('./store');

const {
  checkAntiInvite,
  checkAntiLink,
  checkCapsAbuse,
  checkBadWords,
  checkRepeatedMessages,
  checkAntiSpam,
} = require('./rules');

const { applyPunishmentEngine } = require('./punishmentEngine');
const { sendAutomodLog } = require('./logger');

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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
  if (safeArray(config.ignoredChannelIds).includes(message.channel.id)) return true;
  if (safeArray(config.ignoredUserIds).includes(message.author.id)) return true;

  if (
    message.member.roles?.cache?.some((role) =>
      safeArray(config.ignoredRoleIds).includes(role.id)
    )
  ) {
    return true;
  }

  return false;
}

function buildLoggedAction(action, punishmentReport) {
  if (!punishmentReport) return action;

  if (punishmentReport.dmSent) {
    return `${action} | DM sent ✅`;
  }

  if (safeArray(punishmentReport.failed).includes('dm')) {
    return `${action} | DM failed ❌`;
  }

  return action;
}

async function runAutomod(message) {
  if (!message.guild) return { blocked: false };
  if (!message.member) return { blocked: false };
  if (!message.content) return { blocked: false };
  if (message.author?.bot) return { blocked: false };

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

  const punishmentReport = await applyPunishmentEngine(
    {
      message,
      member: message.member,
      user: message.author,
      guild: message.guild,
      channel: message.channel,
    },
    {
      punishments: hit.punishments,
      rule: hit.rule,
      reason: hit.reason,
      timeoutMinutes: hit.timeoutMinutes,
      source: 'automod',
    }
  );

  const action = punishmentReport.actionText;
  const loggedAction = buildLoggedAction(action, punishmentReport);

  await sendAutomodLog(message, config, {
    rule: hit.rule,
    reason: hit.reason,
    action: loggedAction,
    content: message.content,
    punishmentReport,
  });

  return {
    blocked: true,
    rule: hit.rule,
    reason: hit.reason,
    action,
    loggedAction,
    punishmentReport,
    dmSent: punishmentReport.dmSent,
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