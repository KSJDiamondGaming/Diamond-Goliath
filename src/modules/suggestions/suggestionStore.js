'use strict';

// src/modules/suggestions/suggestionStore.js

const fs = require('fs');
const path = require('path');

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../core/guild/moduleSectionManager');

const MODULE = 'suggestions';

const DEFAULT_DATA = Object.freeze({
  enabled: true,
  nextId: 1,
  items: {},
  stats: {
    totalCreated: 0,
    totalUpdated: 0,
  },
});

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRuntimeRoot(client) {
  return (
    client?.runtimePaths?.mode ||
    process.env.GOLIATH_RUNTIME_PATH ||
    path.join(process.cwd(), 'data')
  );
}

function getLegacySuggestionPath(guildId, client) {
  return path.join(getRuntimeRoot(client), 'guilds', guildId, 'suggestions.json');
}

function cleanId(value, fallback = null) {
  const id = Number(value);
  if (Number.isFinite(id) && id > 0) return id;
  return fallback;
}

function cleanString(value, fallback = '', maxLength = 1500) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function normalizeSuggestion(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const id = cleanId(source.id, 1);

  return {
    id,
    status: ['pending', 'accepted', 'denied', 'implemented', 'archived'].includes(source.status)
      ? source.status
      : 'pending',
    content: cleanString(source.content, '', 1500),
    authorId: source.authorId ? String(source.authorId) : null,
    authorTag: source.authorTag ? cleanString(source.authorTag, '', 120) : null,
    channelId: source.channelId ? String(source.channelId) : null,
    messageId: source.messageId ? String(source.messageId) : null,
    upvotes: Array.isArray(source.upvotes) ? [...new Set(source.upvotes.map(String))] : [],
    downvotes: Array.isArray(source.downvotes) ? [...new Set(source.downvotes.map(String))] : [],
    reviewedBy: source.reviewedBy ? String(source.reviewedBy) : null,
    reviewedByTag: source.reviewedByTag ? cleanString(source.reviewedByTag, '', 120) : null,
    reviewedAt: source.reviewedAt || null,
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || source.createdAt || now(),
  };
}

function normalizeSuggestionsSection(data = {}) {
  const source = isPlainObject(data) ? data : {};
  const sourceItems = isPlainObject(source.items) ? source.items : {};
  const sourceArray = Array.isArray(source.suggestions) ? source.suggestions : [];

  const items = {};

  for (const suggestion of sourceArray) {
    const normalized = normalizeSuggestion(suggestion);
    if (normalized.id) items[String(normalized.id)] = normalized;
  }

  for (const [id, suggestion] of Object.entries(sourceItems)) {
    const normalized = normalizeSuggestion({ ...suggestion, id: suggestion?.id || id });
    if (normalized.id) items[String(normalized.id)] = normalized;
  }

  const ids = Object.keys(items).map(Number).filter(Number.isFinite);
  const highestId = ids.length ? Math.max(...ids) : 0;
  const nextId = Math.max(cleanId(source.nextId, highestId + 1), highestId + 1, 1);

  return {
    ...clone(DEFAULT_DATA),
    ...clone(source),
    enabled: source.enabled !== false,
    nextId,
    items,
    stats: {
      totalCreated: Math.max(0, Number(source.stats?.totalCreated || source.totalCreated || Object.keys(items).length || 0)),
      totalUpdated: Math.max(0, Number(source.stats?.totalUpdated || source.totalUpdated || 0)),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function readLegacySuggestions(guildId, client) {
  const legacyPath = getLegacySuggestionPath(guildId, client);

  if (!fs.existsSync(legacyPath)) return null;

  try {
    const raw = fs.readFileSync(legacyPath, 'utf8');
    if (!raw.trim()) return null;

    return normalizeSuggestionsSection(JSON.parse(raw));
  } catch (error) {
    console.error(`❌ Failed to migrate legacy suggestions for guild ${guildId}`);
    console.error(error);
    return null;
  }
}

function removeLegacySuggestions(guildId, client) {
  const legacyPath = getLegacySuggestionPath(guildId, client);

  try {
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to remove legacy suggestions.json for guild ${guildId}`);
    console.warn(error?.message || error);
  }
}

function hasRealSuggestionData(data = {}) {
  return Boolean(
    data.updatedAt ||
      data.createdAt ||
      Object.keys(isPlainObject(data.items) ? data.items : {}).length ||
      (Array.isArray(data.suggestions) && data.suggestions.length) ||
      Number(data.nextId || 0) > 1 ||
      data.enabled === false
  );
}

function loadSuggestions(guildId, client) {
  const current = getModuleSection(guildId, MODULE, DEFAULT_DATA);

  if (hasRealSuggestionData(current)) {
    removeLegacySuggestions(guildId, client);
    return normalizeSuggestionsSection(current);
  }

  const legacy = readLegacySuggestions(guildId, client);

  if (!legacy) {
    removeLegacySuggestions(guildId, client);
    return normalizeSuggestionsSection(current);
  }

  const migrated = saveModuleSection(guildId, MODULE, legacy);
  removeLegacySuggestions(guildId, client);

  return normalizeSuggestionsSection(migrated);
}

function saveSuggestions(guildId, data, client) {
  const saved = saveModuleSection(guildId, MODULE, normalizeSuggestionsSection(data));
  removeLegacySuggestions(guildId, client);
  return normalizeSuggestionsSection(saved);
}

function createSuggestion(guildId, input = {}, client) {
  const data = loadSuggestions(guildId, client);

  if (!data.enabled) return null;

  const suggestion = normalizeSuggestion({
    id: data.nextId,
    status: 'pending',
    content: input.content,
    authorId: input.authorId || null,
    authorTag: input.authorTag || null,
    channelId: input.channelId || null,
    messageId: input.messageId || null,
    upvotes: [],
    downvotes: [],
    createdAt: now(),
    updatedAt: now(),
  });

  const saved = updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeSuggestionsSection(current);

      return {
        ...normalized,
        nextId: Math.max(Number(normalized.nextId || 1), suggestion.id + 1),
        items: {
          ...normalized.items,
          [String(suggestion.id)]: suggestion,
        },
        stats: {
          ...normalized.stats,
          totalCreated: Number(normalized.stats?.totalCreated || 0) + 1,
        },
        updatedAt: now(),
      };
    },
    DEFAULT_DATA
  );

  removeLegacySuggestions(guildId, client);
  return normalizeSuggestionsSection(saved).items[String(suggestion.id)] || suggestion;
}

function getSuggestion(guildId, suggestionId, client) {
  const data = loadSuggestions(guildId, client);
  return data.items?.[String(Number(suggestionId))] || null;
}

function updateSuggestion(guildId, suggestionId, updates = {}, client) {
  const id = String(Number(suggestionId));

  if (!Number.isFinite(Number(id)) || Number(id) <= 0) return null;

  const saved = updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeSuggestionsSection(current);
      const existing = normalized.items?.[id];

      if (!existing) return normalized;

      const nextSuggestion = normalizeSuggestion({
        ...existing,
        ...(isPlainObject(updates) ? updates : {}),
        id: existing.id,
        updatedAt: now(),
      });

      return {
        ...normalized,
        items: {
          ...normalized.items,
          [id]: nextSuggestion,
        },
        stats: {
          ...normalized.stats,
          totalUpdated: Number(normalized.stats?.totalUpdated || 0) + 1,
        },
        updatedAt: now(),
      };
    },
    DEFAULT_DATA
  );

  removeLegacySuggestions(guildId, client);
  return normalizeSuggestionsSection(saved).items?.[id] || null;
}

function listSuggestions(guildId, options = {}, client) {
  const data = loadSuggestions(guildId, client);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50);

  let suggestions = Object.values(data.items || {})
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  if (options.status) {
    suggestions = suggestions.filter((item) => item.status === options.status);
  }

  return suggestions.slice(0, limit);
}

module.exports = {
  MODULE,
  loadSuggestions,
  saveSuggestions,
  createSuggestion,
  getSuggestion,
  updateSuggestion,
  listSuggestions,
  normalizeSuggestionsSection,
};
