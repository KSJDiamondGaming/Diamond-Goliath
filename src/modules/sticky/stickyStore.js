const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  enabled: true,
  channels: {},
};

function getRuntimeRoot(client) {
  return (
    client?.runtimePaths?.mode ||
    process.env.GOLIATH_RUNTIME_PATH ||
    path.join(process.cwd(), 'data')
  );
}

function getStickyPath(guildId, client) {
  return path.join(getRuntimeRoot(client), 'guilds', guildId, 'sticky.json');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function loadStickyData(guildId, client) {
  const filePath = getStickyPath(guildId, client);

  if (!fs.existsSync(filePath)) {
    return cloneDefaultData();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    return {
      ...cloneDefaultData(),
      ...parsed,
      channels: parsed.channels || {},
    };
  } catch (error) {
    console.error(`❌ Failed to load sticky data for guild ${guildId}`);
    console.error(error);
    return cloneDefaultData();
  }
}

function saveStickyData(guildId, data, client) {
  const filePath = getStickyPath(guildId, client);

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  return data;
}

function getChannelSticky(guildId, channelId, client) {
  const data = loadStickyData(guildId, client);
  return data.channels[channelId] || null;
}

function pickNumber(value, fallback) {
  if (value === 0 || value === '0') return 0;
  if (value === null || value === undefined || value === '') return Number(fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

function setChannelSticky(guildId, channelId, sticky, client) {
  const data = loadStickyData(guildId, client);
  const now = new Date().toISOString();
  const existing = data.channels[channelId] || {};

  data.channels[channelId] = {
    enabled: true,
    channelId,
    type: sticky.type || existing.type || 'text',
    content: sticky.content ?? existing.content ?? '',
    embed: sticky.embed ?? existing.embed ?? null,
    repostEvery: pickNumber(sticky.repostEvery, existing.repostEvery ?? 10),
    cooldownSeconds: pickNumber(sticky.cooldownSeconds, existing.cooldownSeconds ?? 60),
    messageCount: Number(existing.messageCount || 0),
    lastMessageId: existing.lastMessageId || null,
    lastPostedAt: existing.lastPostedAt || null,
    createdBy: existing.createdBy || sticky.updatedBy || null,
    updatedBy: sticky.updatedBy || existing.updatedBy || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  saveStickyData(guildId, data, client);
  return data.channels[channelId];
}

function updateChannelSticky(guildId, channelId, updates, client) {
  const data = loadStickyData(guildId, client);
  const existing = data.channels[channelId];

  if (!existing) return null;

  data.channels[channelId] = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveStickyData(guildId, data, client);
  return data.channels[channelId];
}

function deleteChannelSticky(guildId, channelId, client) {
  const data = loadStickyData(guildId, client);
  const existing = data.channels[channelId] || null;

  delete data.channels[channelId];
  saveStickyData(guildId, data, client);

  return existing;
}

module.exports = {
  loadStickyData,
  saveStickyData,
  getChannelSticky,
  setChannelSticky,
  updateChannelSticky,
  deleteChannelSticky,
};
