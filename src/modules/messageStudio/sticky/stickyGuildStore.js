const {
  getModuleSection,
  saveModuleSection,
} = require('../../../core/guild/moduleSectionManager');

const MODULE_KEY = 'sticky';

const DEFAULT_DATA = {
  enabled: true,
  channels: {},
};

function normalizeData(data = {}) {
  const source = data && typeof data === 'object' ? data : {};

  return {
    ...DEFAULT_DATA,
    ...source,
    enabled: source.enabled !== false,
    channels: source.channels && typeof source.channels === 'object' ? source.channels : {},
  };
}

function loadStickyData(guildId) {
  return normalizeData(getModuleSection(guildId, MODULE_KEY, DEFAULT_DATA));
}

function saveStickyData(guildId, data) {
  return saveModuleSection(guildId, MODULE_KEY, normalizeData(data));
}

function getChannelSticky(guildId, channelId) {
  const data = loadStickyData(guildId);
  return data.channels[channelId] || null;
}

function pickNumber(value, fallback) {
  if (value === 0 || value === '0') return 0;
  if (value === null || value === undefined || value === '') return Number(fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

function setChannelSticky(guildId, channelId, sticky) {
  const data = loadStickyData(guildId);
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

  saveStickyData(guildId, data);
  return data.channels[channelId];
}

function updateChannelSticky(guildId, channelId, updates) {
  const data = loadStickyData(guildId);
  const existing = data.channels[channelId];

  if (!existing) return null;

  data.channels[channelId] = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveStickyData(guildId, data);
  return data.channels[channelId];
}

function deleteChannelSticky(guildId, channelId) {
  const data = loadStickyData(guildId);
  const existing = data.channels[channelId] || null;

  delete data.channels[channelId];
  saveStickyData(guildId, data);

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
