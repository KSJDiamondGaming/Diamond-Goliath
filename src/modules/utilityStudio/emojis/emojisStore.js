'use strict';

const { getGuildConfig, saveGuildConfig } = require('../../../core/guild/guildManager');

const DEFAULTS = Object.freeze({
  enabled: false,
  settings: {
    allowCopy: true,
    allowDelete: true,
    allowRename: true,
    allowBackup: true,
    allowRemix: true,
  },
});

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function getEmojiSection(guildId) {
  const config = getGuildConfig(guildId) || {};
  const section = config.emojis || config.modules?.emojis || {};
  const defaults = cloneDefaults();
  return {
    ...defaults,
    ...section,
    settings: {
      ...defaults.settings,
      ...(section.settings || {}),
    },
  };
}

function saveEmojiSection(guildId, patch, guild = null) {
  const config = getGuildConfig(guildId) || {};
  const current = getEmojiSection(guildId);
  const next = {
    ...current,
    ...patch,
    settings: {
      ...current.settings,
      ...(patch.settings || {}),
    },
  };

  config.emojis = next;
  saveGuildConfig(guildId, config, guild);
  return next;
}

module.exports = {
  DEFAULTS,
  getEmojiSection,
  saveEmojiSection,
};
