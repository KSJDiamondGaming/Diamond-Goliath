const { PermissionsBitField } = require('discord.js');
const guildStore = require('../../guild/guildManager')

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

const { applyPunishment } = require('./actions');
const { sendAutomodLog } = require('./logger');

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