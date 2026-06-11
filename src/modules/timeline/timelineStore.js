'use strict';

// src/modules/timeline/timelineStore.js

const fs = require('fs');
const path = require('path');

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../guild/moduleSectionManager');

const DEFAULT_DATA = Object.freeze({
  enabled: true,
  events: [],
});

const MODULE = 'timeline';
const MAX_EVENTS = 250;

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

function getLegacyTimelinePath(guildId, client) {
  return path.join(getRuntimeRoot(client), 'guilds', guildId, 'timeline.json');
}

function normalizeTimeline(data = {}) {
  const source = isPlainObject(data) ? data : {};

  return {
    ...clone(DEFAULT_DATA),
    ...clone(source),
    enabled: source.enabled !== false,
    events: Array.isArray(source.events)
      ? source.events.slice(0, MAX_EVENTS)
      : [],
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
}

function readLegacyTimeline(guildId, client) {
  const legacyPath = getLegacyTimelinePath(guildId, client);

  if (!fs.existsSync(legacyPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    return normalizeTimeline(parsed);
  } catch (error) {
    console.error(`❌ Failed to read legacy timeline.json for guild ${guildId}`);
    console.error(error);
    return null;
  }
}

function removeLegacyTimeline(guildId, client) {
  const legacyPath = getLegacyTimelinePath(guildId, client);

  try {
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to remove legacy timeline.json for guild ${guildId}`);
    console.warn(error?.message || error);
  }
}

function hasRealTimelineData(data = {}) {
  return (
    data.updatedAt ||
    data.createdAt ||
    (Array.isArray(data.events) && data.events.length > 0) ||
    data.enabled === false
  );
}

function migrateLegacyTimelineIfNeeded(guildId, client) {
  const current = getModuleSection(guildId, MODULE, DEFAULT_DATA);

  if (hasRealTimelineData(current)) {
    removeLegacyTimeline(guildId, client);
    return normalizeTimeline(current);
  }

  const legacy = readLegacyTimeline(guildId, client);
  if (!legacy) return normalizeTimeline(current);

  const migrated = saveModuleSection(guildId, MODULE, legacy);
  removeLegacyTimeline(guildId, client);

  return normalizeTimeline(migrated);
}

function loadTimeline(guildId, client) {
  return migrateLegacyTimelineIfNeeded(guildId, client);
}

function saveTimeline(guildId, data, client) {
  const saved = saveModuleSection(guildId, MODULE, normalizeTimeline(data));
  removeLegacyTimeline(guildId, client);
  return normalizeTimeline(saved);
}

function addTimelineEvent(guildId, event = {}, client) {
  const data = loadTimeline(guildId, client);

  if (!data.enabled) return null;

  const timelineEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(event.type || 'system'),
    title: String(event.title || 'Timeline Event').slice(0, 120),
    description: event.description ? String(event.description).slice(0, 500) : null,
    actorId: event.actorId || null,
    actorTag: event.actorTag || null,
    channelId: event.channelId || null,
    targetId: event.targetId || null,
    meta: isPlainObject(event.meta) ? event.meta : {},
    createdAt: new Date().toISOString(),
  };

  const saved = updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeTimeline(current);
      return {
        ...normalized,
        events: [timelineEvent, ...normalized.events].slice(0, MAX_EVENTS),
      };
    },
    DEFAULT_DATA
  );

  removeLegacyTimeline(guildId, client);
  return normalizeTimeline(saved).events[0] || timelineEvent;
}

function listTimelineEvents(guildId, options = {}, client) {
  const data = loadTimeline(guildId, client);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50);

  let events = data.events;

  if (options.type) {
    events = events.filter((event) => event.type === options.type);
  }

  return events.slice(0, limit);
}

function clearTimeline(guildId, client) {
  const data = loadTimeline(guildId, client);
  const saved = saveTimeline(guildId, { ...data, events: [] }, client);
  return saved;
}

module.exports = {
  loadTimeline,
  saveTimeline,
  addTimelineEvent,
  listTimelineEvents,
  clearTimeline,
};
