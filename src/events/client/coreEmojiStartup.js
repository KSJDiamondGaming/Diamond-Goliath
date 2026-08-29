'use strict';

const { Events } = require('discord.js');
const terminal = require('../../core/logging/terminalLogger').createLogger('bot');
const emojis = require('../../modules/utilityStudio/emojis/emojis');
const emojiApi = require('../../modules/utilityStudio/emojis/emojisApi');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      const result = await emojiApi.syncCoreAssets(
        client,
        emojis.CORE_EMOJI_ALIASES,
        emojis.CORE_EMOJI_PREFIX,
      );

      if (!result.assetDirectoryPresent) {
        terminal.warn(`Goliath Core emoji asset directory is missing: ${result.assetDirectory}`);
        return;
      }

      if (result.created.length > 0) {
        terminal.success(`Goliath Core emoji seed created ${result.created.length} missing application emoji(s) from repo assets.`);
      }
      if (result.missingAssets.length > 0) terminal.warn(`Goliath Core emoji assets missing for: ${result.missingAssets.join(', ')}`);
      if (result.failed.length > 0) terminal.error(`Goliath Core emoji seed failed for ${result.failed.length} asset(s): ${result.failed.map((entry) => `${entry.alias}: ${entry.error}`).join(' | ')}`);

      if (result.healthy) terminal.success(`Goliath Core emojis ready: ${result.installed}/${result.expected} application emojis available globally.`);
      else terminal.warn(`Goliath Core emojis incomplete: ${result.installed}/${result.expected} available; ${result.missingAssets.length} source asset(s) missing; ${result.failed.length} failed.`);

      let expiredCount = 0;
      let unhealthyCount = 0;
      for (const guild of client.guilds.cache.values()) {
        try {
          const expired = await emojis.processExpiredTemporary(client, guild.id);
          expiredCount += expired.length;
          const health = await emojis.health(client, guild.id);
          if (!health.healthy) {
            unhealthyCount += 1;
            terminal.warn(`Emoji Studio health warning for ${guild.name} (${guild.id}): ${health.brokenFavourites.length} broken favourite(s), ${health.brokenAliases.length} broken alias(es), ${health.brokenPackEntries.length} broken pack reference(s), ${health.expiredTemporary.length} expired temporary emoji(s).`);
          }
        } catch (error) {
          unhealthyCount += 1;
          terminal.warn(`Emoji Studio recovery check failed for ${guild.name} (${guild.id}): ${error?.message || error}`);
        }
      }

      if (expiredCount > 0) terminal.info(`Emoji Studio expiry recovery processed ${expiredCount} temporary emoji entr${expiredCount === 1 ? 'y' : 'ies'}.`);
      if (unhealthyCount === 0) terminal.success(`Emoji Studio health ready: ${client.guilds.cache.size} guild(s) healthy.`);
    } catch (error) {
      terminal.error(`Failed to initialise Goliath Core/Emoji Studio: ${error?.message || error}`);
    }
  },
};
