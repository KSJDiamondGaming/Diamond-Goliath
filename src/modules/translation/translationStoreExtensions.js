'use strict';

// src/modules/translation/translationStoreExtensions.js
// Thread storage helpers layered on the existing guild JSON translation store.

const translationStore = require('./translationStore');
const translationManager = require('./translationManager');

function now() {
  return new Date().toISOString();
}

function saveThreadMapping(guildId, sourceChannelId, languageCode, mapping = {}, guildOrMeta = {}) {
  const safeLanguage = translationManager.normalizeLanguage(languageCode);

  return translationStore.updateTranslationSection(guildId, (section) => ({
    ...section,
    threadMappings: {
      ...(section.threadMappings || {}),
      [sourceChannelId]: {
        ...(section.threadMappings?.[sourceChannelId] || {}),
        [safeLanguage]: {
          ...(section.threadMappings?.[sourceChannelId]?.[safeLanguage] || {}),
          ...mapping,
          languageCode: safeLanguage,
          updatedAt: now(),
          createdAt: section.threadMappings?.[sourceChannelId]?.[safeLanguage]?.createdAt || now(),
        },
      },
    },
    updatedAt: now(),
  }), guildOrMeta).threadMappings[sourceChannelId][safeLanguage];
}

function addTranslationLog(guildId, entry = {}, guildOrMeta = {}) {
  return translationStore.updateTranslationSection(guildId, (section) => ({
    ...section,
    logs: [
      ...(section.logs || []),
      {
        ...entry,
        createdAt: now(),
      },
    ].slice(-100),
    updatedAt: now(),
  }), guildOrMeta).logs;
}

translationStore.saveThreadMapping = translationStore.saveThreadMapping || saveThreadMapping;
translationStore.addTranslationLog = translationStore.addTranslationLog || addTranslationLog;

module.exports = translationStore;
