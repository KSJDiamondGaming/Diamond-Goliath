const { getGuildAutoModConfig } = require('../automodStore');
const { executeAutomodAction } = require('./automodActions');

const antiInviteCheck = require('./checks/antiInvite');
const antiLinkCheck = require('./checks/antiLink');
const badWordsCheck = require('./checks/badWords');
const capsAbuseCheck = require('./checks/capsAbuse');
const antiSpamCheck = require('./checks/antiSpam');
const repeatedMessagesCheck = require('./checks/repeatedMessages');

async function processAutomod(message) {
  try {
    if (!message.guild) return;

    const config = getGuildAutoModConfig(message.guild.id);

    if (!config.enabled) return;
    if (config.ignoreBots && message.author.bot) return;

    if (config.ignoreAdmins && message.member?.permissions?.has('Administrator')) {
      return;
    }

    if (config.ignoredChannelIds.includes(message.channel.id)) return;
    if (config.ignoredUserIds.includes(message.author.id)) return;

    if (message.member?.roles?.cache?.some((role) => config.ignoredRoleIds.includes(role.id))) {
      return;
    }

    const checks = [
      badWordsCheck,
      antiInviteCheck,
      antiLinkCheck,
      capsAbuseCheck,
      antiSpamCheck,
      repeatedMessagesCheck,
    ];

    for (const check of checks) {
      const result = check(message, config);

      if (result?.matched) {
        await executeAutomodAction(message, result);
        return;
      }
    }
  } catch (error) {
    console.error('[AUTOMOD] Processor error:', error);
  }
}

module.exports = {
  processAutomod,
};
