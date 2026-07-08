'use strict';

// src/modules/timeline/timelineStore.js

const fs = require('fs');
const path = require('path');

const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../core/guild/moduleSectionManager');

const DEFAULT_DATA = Object.freeze({
  enabled: true,
  events: [],
  settings: {
    maxEvents: 250,
    auditEnabled: true,
  },
  stats: {
    totalEvents: 0,
    clearedEvents: 0,
  },
});

const MODULE = 'timeline';
const MAX_EVENTS = 250;

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
  return text.slice(0, maxLength);
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanLimit(value, fallback = MAX_EVENTS) {
  return Math.min(Math.max(Math.floor(cleanNumber(value, fallback)), 1), MAX_EVENTS);
}

function createTimelineEventId(type = 'event') {
  return `tl_${cleanString(type, 'event', 30).replace(/[^a-z0-9_-]/gi, '_')}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

function normalizeTimelineEvent(event = {}) {
  const source = isPlainObject(event) ? event : {};
  const type = cleanString(source.type || 'system', 'system', 80) || 'system';

  return {
    id: cleanString(source.id || createTimelineEventId(type), '', 120),
    type,
    title: cleanString(source.title || 'Timeline Event', 'Timeline Event', 120),
    description: source.description ? cleanString(source.description, '', 500) : null,
    actorId: cleanDiscordId(source.actorId),
    actorTag: source.actorTag ? cleanString(source.actorTag, '', 120) : null,
    channelId: cleanDiscordId(source.channelId),
    targetId: cleanDiscordId(source.targetId),
    meta: isPlainObject(source.meta) ? clone(source.meta) : {},
    createdAt: source.createdAt || now(),
  };
}

function normalizeTimeline(data = {}) {
  const source = isPlainObject(data) ? data : {};
  const settings = {
    ...clone(DEFAULT_DATA.settings),
    ...clone(isPlainObject(source.settings) ? source.settings : {}),
  };

  settings.maxEvents = cleanLimit(settings.maxEvents, MAX_EVENTS);
  settings.auditEnabled = settings.auditEnabled !== false;

  const events = Array.isArray(source.events)
    ? source.events.map(normalizeTimelineEvent).slice(0, settings.maxEvents)
    : [];

  return {
    ...clone(DEFAULT_DATA),
    ...clone(source),
    enabled: source.enabled !== false,
    events,
    settings,
    stats: {
      totalEvents: Math.max(
        events.length,
        Math.floor(cleanNumber(source.stats?.totalEvents, events.length))
      ),
      clearedEvents: Math.max(0, Math.floor(cleanNumber(source.stats?.clearedEvents, 0))),
    },
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || now(),
  };
}

function readLegacyTimeline(guildId, client) {
  const legacyPath = getLegacyTimelinePath(guildId, client);

  if (!fs.existsSync(legacyPath)) return null;

  try {
    const raw = fs.readFileSync(legacyPath, 'utf8');
    if (!raw.trim()) return null;

    const parsed = JSON.parse(raw);
    return normalizeTimeline(parsed);
  } catch (error) {
    console.warn(`⚠️ Ignoring corrupt legacy timeline.json for guild ${guildId}`);
    console.warn(error?.message || error);
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
    data.enabled === false ||
    data.stats?.totalEvents > 0
  );
}

function migrateLegacyTimelineIfNeeded(guildId, client) {
  const current = getModuleSection(guildId, MODULE, DEFAULT_DATA);

  if (hasRealTimelineData(current)) {
    removeLegacyTimeline(guildId, client);
    return normalizeTimeline(current);
  }

  const legacy = readLegacyTimeline(guildId, client);
  if (!legacy) {
    removeLegacyTimeline(guildId, client);
    return normalizeTimeline(current);
  }

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

  if (!data.enabled || data.settings.auditEnabled === false) return null;

  const timelineEvent = normalizeTimelineEvent(event);

  const saved = updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeTimeline(current);
      const maxEvents = cleanLimit(normalized.settings?.maxEvents, MAX_EVENTS);

      return {
        ...normalized,
        events: [timelineEvent, ...normalized.events].slice(0, maxEvents),
        stats: {
          ...normalized.stats,
          totalEvents: Math.max(0, cleanNumber(normalized.stats?.totalEvents, 0)) + 1,
        },
        updatedAt: now(),
      };
    },
    DEFAULT_DATA
  );

  removeLegacyTimeline(guildId, client);
  return normalizeTimeline(saved).events[0] || timelineEvent;
}

function listTimelineEvents(guildId, options = {}, client) {
  const data = loadTimeline(guildId, client);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 100);

  let events = data.events;

  if (options.type) {
    events = events.filter((event) => event.type === options.type);
  }

  if (options.actorId) {
    events = events.filter((event) => event.actorId === cleanDiscordId(options.actorId));
  }

  if (options.targetId) {
    events = events.filter((event) => event.targetId === cleanDiscordId(options.targetId));
  }

  return events.slice(0, limit);
}

function clearTimeline(guildId, client) {
  const data = loadTimeline(guildId, client);
  const clearedCount = data.events.length;

  const saved = saveTimeline(
    guildId,
    {
      ...data,
      events: [],
      stats: {
        ...data.stats,
        clearedEvents: Math.max(0, cleanNumber(data.stats?.clearedEvents, 0)) + clearedCount,
      },
      updatedAt: now(),
    },
    client
  );

  return saved;
}

function getTimelineStats(guildId, client) {
  const data = loadTimeline(guildId, client);

  return {
    enabled: data.enabled,
    storedEvents: data.events.length,
    totalEvents: data.stats.totalEvents,
    clearedEvents: data.stats.clearedEvents,
    maxEvents: data.settings.maxEvents,
    auditEnabled: data.settings.auditEnabled,
    updatedAt: data.updatedAt,
  };
}

module.exports = {
  loadTimeline,
  saveTimeline,
  addTimelineEvent,
  listTimelineEvents,
  clearTimeline,
  getTimelineStats,
  normalizeTimeline,
  normalizeTimelineEvent,
};
