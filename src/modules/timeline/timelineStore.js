const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  enabled: true,
  events: [],
};

const MAX_EVENTS = 250;

function getRuntimeRoot(client) {
  return (
    client?.runtimePaths?.mode ||
    process.env.GOLIATH_RUNTIME_PATH ||
    path.join(process.cwd(), 'data')
  );
}

function getTimelinePath(guildId, client) {
  return path.join(getRuntimeRoot(client), 'guilds', guildId, 'timeline.json');
}

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadTimeline(guildId, client) {
  const filePath = getTimelinePath(guildId, client);

  if (!fs.existsSync(filePath)) {
    return cloneDefaultData();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    return {
      ...cloneDefaultData(),
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (error) {
    console.error(`❌ Failed to load timeline for guild ${guildId}`);
    console.error(error);
    return cloneDefaultData();
  }
}

function saveTimeline(guildId, data, client) {
  const filePath = getTimelinePath(guildId, client);

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  return data;
}

function addTimelineEvent(guildId, event, client) {
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
    meta: event.meta || {},
    createdAt: new Date().toISOString(),
  };

  data.events.unshift(timelineEvent);
  data.events = data.events.slice(0, MAX_EVENTS);

  saveTimeline(guildId, data, client);
  return timelineEvent;
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
  data.events = [];
  saveTimeline(guildId, data, client);
  return data;
}

module.exports = {
  loadTimeline,
  saveTimeline,
  addTimelineEvent,
  listTimelineEvents,
  clearTimeline,
};
