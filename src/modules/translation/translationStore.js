'use strict';

// src/modules/translation/translationStore.js
// Stores all translation config in modules.translation through guildManager/moduleSectionManager.

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../guild/moduleSectionManager');

const MODULE = 'translation';

const SUPPORTED_PROVIDERS = Object.freeze([
  'manual',
  'openai',
  'deepl',
  'google',
]);

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '', maxLength = 500) {
  const text = String(value ?? fallback).trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanLanguageCode(value, fallback = 'en') {
  const code = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .slice(0, 12);

  return code || fallback;
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanIdMap(value = {}) {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([id, config]) => [cleanDiscordId(id), config])
      .filter(([id]) => Boolean(id))
  );
}

function defaultTranslationSection() {
  return {
    enabled: false,
    settings: {
      provider: 'manual',
      autoDetect: true,
      threadMode: true,
      translateEdits: false,
      defaultSourceLanguage: 'auto',
      defaultTargetLanguage: 'en',
      targetLanguages: ['en'],
      maxCharacters: 1500,
      cooldownMs: 10000,
      createThreadForManual: true,
      createThreadForAuto: true,
      logTranslations: true,
    },
    channels: {},
    userPreferences: {},
    cache: {},
    analytics: {
      manualTranslations: 0,
      autoTranslations: 0,
      threadsCreated: 0,
      failedTranslations: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeChannelConfig(config = {}) {
  const source = isPlainObject(config) ? config : {};

  return {
    enabled: source.enabled !== false,
    mode: ['manual', 'auto', 'disabled'].includes(source.mode) ? source.mode : 'manual',
    threadMode: source.threadMode !== false,
    autoDetect: source.autoDetect !== false,
    sourceLanguage: cleanLanguageCode(source.sourceLanguage || 'auto', 'auto'),
    targetLanguages: Array.isArray(source.targetLanguages)
      ? [...new Set(source.targetLanguages.map((code) => cleanLanguageCode(code)).filter(Boolean))].slice(0, 10)
      : ['en'],
    ignoredRoleIds: Array.isArray(source.ignoredRoleIds)
      ? source.ignoredRoleIds.map(cleanDiscordId).filter(Boolean)
      : [],
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || source.createdAt || now(),
  };
}

function normalizeUserPreference(preference = {}) {
  const source = isPlainObject(preference) ? preference : {};

  return {
    enabled: source.enabled !== false,
    preferredLanguage: cleanLanguageCode(source.preferredLanguage || 'en'),
    autoTranslateDMs: source.autoTranslateDMs === true,
    updatedAt: source.updatedAt || now(),
  };
}

function normalizeTranslationSection(section = {}) {
  const base = defaultTranslationSection();
  const source = isPlainObject(section) ? section : {};
  const rawSettings = isPlainObject(source.settings) ? source.settings : {};

  const provider = SUPPORTED_PROVIDERS.includes(rawSettings.provider)
    ? rawSettings.provider
    : base.settings.provider;

  return {
    ...base,
    ...clone(source),
    enabled: source.enabled === true,
    settings: {
      ...base.settings,
      ...clone(rawSettings),
      provider,
      autoDetect: rawSettings.autoDetect !== false,
      threadMode: rawSettings.threadMode !== false,
      translateEdits: rawSettings.translateEdits === true,
      defaultSourceLanguage: cleanLanguageCode(rawSettings.defaultSourceLanguage || 'auto', 'auto'),
      defaultTargetLanguage: cleanLanguageCode(rawSettings.defaultTargetLanguage || 'en'),
      targetLanguages: Array.isArray(rawSettings.targetLanguages)
        ? [...new Set(rawSettings.targetLanguages.map((code) => cleanLanguageCode(code)).filter(Boolean))].slice(0, 10)
        : ['en'],
      maxCharacters: Math.min(Math.max(Number(rawSettings.maxCharacters || 1500), 100), 4000),
      cooldownMs: Math.min(Math.max(Number(rawSettings.cooldownMs || 10000), 0), 300000),
      createThreadForManual: rawSettings.createThreadForManual !== false,
      createThreadForAuto: rawSettings.createThreadForAuto !== false,
      logTranslations: rawSettings.logTranslations !== false,
    },
    channels: Object.fromEntries(
      Object.entries(cleanIdMap(source.channels || {})).map(([channelId, config]) => [
        channelId,
        normalizeChannelConfig(config),
      ])
    ),
    userPreferences: Object.fromEntries(
      Object.entries(cleanIdMap(source.userPreferences || {})).map(([userId, preference]) => [
        userId,
        normalizeUserPreference(preference),
      ])
    ),
    cache: isPlainObject(source.cache) ? clone(source.cache) : {},
    analytics: {
      manualTranslations: Math.max(0, Number(source.analytics?.manualTranslations || 0)),
      autoTranslations: Math.max(0, Number(source.analytics?.autoTranslations || 0)),
      threadsCreated: Math.max(0, Number(source.analytics?.threadsCreated || 0)),
      failedTranslations: Math.max(0, Number(source.analytics?.failedTranslations || 0)),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getTranslationSection(guildId) {
  return normalizeTranslationSection(getModuleSection(guildId, MODULE, defaultTranslationSection()));
}

function saveTranslationSection(guildId, section, guildOrMeta = {}) {
  return normalizeTranslationSection(saveModuleSection(guildId, MODULE, normalizeTranslationSection(section), guildOrMeta));
}

function updateTranslationSection(guildId, updater, guildOrMeta = {}) {
  return normalizeTranslationSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeTranslationSection(current);
      const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
      return normalizeTranslationSection(next);
    },
    defaultTranslationSection(),
    guildOrMeta
  ));
}

function setTranslationEnabled(guildId, enabled = true, guildOrMeta = {}) {
  return updateTranslationSection(guildId, (section) => ({
    ...section,
    enabled: Boolean(enabled),
    updatedAt: now(),
  }), guildOrMeta);
}

function saveChannelConfig(guildId, channelId, config = {}, guildOrMeta = {}) {
  const safeChannelId = cleanDiscordId(channelId);
  if (!safeChannelId) throw new Error('Invalid channel ID.');

  return updateTranslationSection(guildId, (section) => ({
    ...section,
    channels: {
      ...section.channels,
      [safeChannelId]: normalizeChannelConfig({
        ...(section.channels[safeChannelId] || {}),
        ...config,
        updatedAt: now(),
      }),
    },
    updatedAt: now(),
  }), guildOrMeta).channels[safeChannelId];
}

function saveUserPreference(guildId, userId, preference = {}, guildOrMeta = {}) {
  const safeUserId = cleanDiscordId(userId);
  if (!safeUserId) throw new Error('Invalid user ID.');

  return updateTranslationSection(guildId, (section) => ({
    ...section,
    userPreferences: {
      ...section.userPreferences,
      [safeUserId]: normalizeUserPreference({
        ...(section.userPreferences[safeUserId] || {}),
        ...preference,
        updatedAt: now(),
      }),
    },
    updatedAt: now(),
  }), guildOrMeta).userPreferences[safeUserId];
}

function incrementAnalytics(guildId, increments = {}, guildOrMeta = {}) {
  return updateTranslationSection(guildId, (section) => {
    const analytics = { ...section.analytics };

    for (const [key, amount] of Object.entries(increments || {})) {
      const value = Number(amount || 0);
      if (!Number.isFinite(value)) continue;
      analytics[key] = Math.max(0, Number(analytics[key] || 0) + value);
    }

    return {
      ...section,
      analytics,
      updatedAt: now(),
    };
  }, guildOrMeta).analytics;
}

module.exports = {
  MODULE,
  SUPPORTED_PROVIDERS,
  defaultTranslationSection,
  normalizeTranslationSection,
  normalizeChannelConfig,
  normalizeUserPreference,
  getTranslationSection,
  saveTranslationSection,
  updateTranslationSection,
  setTranslationEnabled,
  saveChannelConfig,
  saveUserPreference,
  incrementAnalytics,
};
