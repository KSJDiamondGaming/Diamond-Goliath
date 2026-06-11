'use strict';

// src/prefix/prefixStore.js

const guildManager = require('../guild/guildManager');

const DEFAULT_PREFIX = '!';
const LEGACY_UNSET_PREFIX = '/';
const MIN_PREFIX_LENGTH = 1;
const MAX_PREFIX_LENGTH = 5;

function normalizePrefix(value, fallback = DEFAULT_PREFIX) {
  const raw = String(value ?? '').trim();
  const prefix = raw || fallback;

  if (prefix.includes(' ')) {
    throw new Error('Prefix cannot contain spaces.');
  }

  if (prefix.length < MIN_PREFIX_LENGTH || prefix.length > MAX_PREFIX_LENGTH) {
    throw new Error(`Prefix must be ${MIN_PREFIX_LENGTH}-${MAX_PREFIX_LENGTH} characters.`);
  }

  if (/^[A-Za-z0-9]$/.test(prefix)) {
    throw new Error('Prefix must use a symbol or more than one character.');
  }

  return prefix;
}

function getGeneralSettings(guildId) {
  const guildData = guildManager.getGuildData(guildId) || {};
  return guildData.generalSettings || {};
}

function getGuildPrefix(guildId) {
  const settings = getGeneralSettings(guildId);
  const storedPrefix = String(settings.prefix || '').trim();

  try {
    if (!storedPrefix || storedPrefix === LEGACY_UNSET_PREFIX) {
      return DEFAULT_PREFIX;
    }

    return normalizePrefix(storedPrefix);
  } catch {
    return DEFAULT_PREFIX;
  }
}

function setGuildPrefix(guildId, prefix, guildOrMeta = {}) {
  const safePrefix = normalizePrefix(prefix);
  const current = getGeneralSettings(guildId);

  if (typeof guildManager.updateGuildSection === 'function') {
    guildManager.updateGuildSection(
      guildId,
      'generalSettings',
      (settings = {}) => ({
        ...current,
        ...settings,
        prefix: safePrefix,
        updatedAt: new Date().toISOString(),
      }),
      current,
      guildOrMeta
    );
  } else {
    guildManager.saveGuildData(
      guildId,
      {
        generalSettings: {
          ...current,
          prefix: safePrefix,
          updatedAt: new Date().toISOString(),
        },
      },
      guildOrMeta
    );
  }

  if (typeof guildManager.reloadGuild === 'function') {
    guildManager.reloadGuild(guildId);
  }

  return safePrefix;
}

function resetGuildPrefix(guildId, guildOrMeta = {}) {
  return setGuildPrefix(guildId, DEFAULT_PREFIX, guildOrMeta);
}

function getMentionPrefixes(client) {
  if (!client?.user?.id) return [];
  return [`<@${client.user.id}>`, `<@!${client.user.id}>`];
}

function getPrefixInfo(guildId) {
  const prefix = getGuildPrefix(guildId);

  return {
    prefix,
    defaultPrefix: DEFAULT_PREFIX,
    isDefault: prefix === DEFAULT_PREFIX,
  };
}

module.exports = {
  DEFAULT_PREFIX,
  LEGACY_UNSET_PREFIX,
  normalizePrefix,
  getGuildPrefix,
  setGuildPrefix,
  resetGuildPrefix,
  getMentionPrefixes,
  getPrefixInfo,
};
