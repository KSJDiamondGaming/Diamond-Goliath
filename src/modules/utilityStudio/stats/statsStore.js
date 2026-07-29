'use strict';

const guildManager = require('../../../core/guild/guildManager');

const MODULE_KEY = 'stats';
const MAX_ITEMS = 10;
const MAX_SNAPSHOTS = 120;

const DEFAULT_STATS = {
  enabled: false,
  trackMessages: true,
  trackVoice: true,
  trackMembers: true,
  ignoreBots: true,
  ignoredChannels: [],
  ignoredRoles: [],
  counters: [],
  settings: { retentionDays: 30 },
  data: {
    messages: {},
    voice: {},
    members: { joins: 0, leaves: 0, snapshots: [] },
  },
  analytics: { viewed: 0 },
};

function copy(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function merge(defaults = {}, source = {}) {
  if (!isObject(defaults)) return copy(source);
  if (!isObject(source)) return copy(defaults);
  const output = copy(defaults);
  for (const [key, value] of Object.entries(source)) {
    output[key] = isObject(value) && isObject(output[key]) ? merge(output[key], value) : copy(value);
  }
  return output;
}

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function addToMap(map, key, amount = 1) {
  const safeKey = String(key || 'unknown');
  map[safeKey] = Number(map[safeKey] || 0) + Number(amount || 0);
}

function getStats(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return merge(DEFAULT_STATS, modules[MODULE_KEY] || {});
}

function saveStats(guildId, stats, guildOrMeta = {}) {
  const updatedModules = guildManager.updateGuildSection(
    guildId,
    'modules',
    (modules) => ({ ...modules, [MODULE_KEY]: merge(DEFAULT_STATS, stats) }),
    {},
    guildOrMeta
  );
  return updatedModules[MODULE_KEY];
}

function updateStats(guildId, updater, guildOrMeta = {}) {
  const current = getStats(guildId);
  const next = typeof updater === 'function' ? updater(copy(current)) : updater;
  return saveStats(guildId, next, guildOrMeta);
}

function setEnabled(guildId, enabled, guildOrMeta = {}) {
  return updateStats(guildId, (stats) => ({ ...stats, enabled: Boolean(enabled) }), guildOrMeta);
}

function isEnabled(guildId) {
  return getStats(guildId).enabled === true;
}

function ignored(stats, member, channelId) {
  if (stats.ignoreBots !== false && member?.user?.bot) return true;
  if (Array.isArray(stats.ignoredChannels) && stats.ignoredChannels.includes(channelId)) return true;
  const ignoredRoles = new Set(Array.isArray(stats.ignoredRoles) ? stats.ignoredRoles : []);
  return Boolean(ignoredRoles.size && member?.roles?.cache?.some?.((role) => ignoredRoles.has(role.id)));
}

function addMessage(message) {
  if (!message?.guild?.id) return null;
  return updateStats(message.guild.id, (stats) => {
    if (stats.enabled !== true || stats.trackMessages === false || ignored(stats, message.member, message.channelId)) return stats;
    const today = dayKey();
    stats.data.messages[today] = stats.data.messages[today] || { total: 0, users: {}, channels: {} };
    const bucket = stats.data.messages[today];
    bucket.total = Number(bucket.total || 0) + 1;
    addToMap(bucket.users, message.author?.id, 1);
    addToMap(bucket.channels, message.channelId, 1);
    stats.updatedAt = new Date().toISOString();
    return stats;
  }, message.guild);
}

function addVoiceMinutes(member, channelId, minutes) {
  if (!member?.guild?.id) return null;
  const safeMinutes = Math.max(0, Number(minutes || 0));
  if (!safeMinutes) return getStats(member.guild.id);
  return updateStats(member.guild.id, (stats) => {
    if (stats.enabled !== true || stats.trackVoice === false || ignored(stats, member, channelId)) return stats;
    const today = dayKey();
    stats.data.voice[today] = stats.data.voice[today] || { totalMinutes: 0, users: {}, channels: {} };
    const bucket = stats.data.voice[today];
    bucket.totalMinutes = Number(bucket.totalMinutes || 0) + safeMinutes;
    addToMap(bucket.users, member.user?.id || member.id, safeMinutes);
    addToMap(bucket.channels, channelId, safeMinutes);
    stats.updatedAt = new Date().toISOString();
    return stats;
  }, member.guild);
}

function addMemberEvent(member, type) {
  if (!member?.guild?.id) return null;
  return updateStats(member.guild.id, (stats) => {
    if (stats.enabled !== true || stats.trackMembers === false) return stats;
    if (type === 'join') stats.data.members.joins = Number(stats.data.members.joins || 0) + 1;
    if (type === 'leave') stats.data.members.leaves = Number(stats.data.members.leaves || 0) + 1;
    stats.data.members.snapshots = Array.isArray(stats.data.members.snapshots) ? stats.data.members.snapshots : [];
    stats.data.members.snapshots.unshift({ type, memberCount: Number(member.guild.memberCount || 0), at: new Date().toISOString() });
    stats.data.members.snapshots = stats.data.members.snapshots.slice(0, MAX_SNAPSHOTS);
    stats.updatedAt = new Date().toISOString();
    return stats;
  }, member.guild);
}

function resetStats(guildId, guildOrMeta = {}) {
  return saveStats(guildId, DEFAULT_STATS, guildOrMeta);
}

function top(dailyMap = {}, field = 'users') {
  const totals = {};
  for (const day of Object.values(dailyMap || {})) {
    for (const [id, amount] of Object.entries(day?.[field] || {})) addToMap(totals, id, Number(amount || 0));
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, MAX_ITEMS).map(([id, value]) => ({ id, value }));
}

function getSummary(guildId) {
  const stats = getStats(guildId);
  const messageDays = Object.values(stats.data.messages || {});
  const voiceDays = Object.values(stats.data.voice || {});
  return {
    enabled: stats.enabled === true,
    totals: {
      messages: messageDays.reduce((total, day) => total + Number(day.total || 0), 0),
      voiceMinutes: Math.round(voiceDays.reduce((total, day) => total + Number(day.totalMinutes || 0)),
      joins: Number(stats.data.members?.joins || 0),
      leaves: Number(stats.data.members?.leaves || 0),
    },
    top: {
      messageUsers: top(stats.data.messages, 'users'),
      messageChannels: top(stats.data.messages, 'channels'),
      voiceUsers: top(stats.data.voice, 'users'),
      voiceChannels: top(stats.data.voice, 'channels'),
    },
    members: stats.data.members || DEFAULT_STATS.data.members,
    counters: Array.isArray(stats.counters) ? stats.counters : [],
    settings: stats.settings || {},
    updatedAt: stats.updatedAt || null,
  };
}

module.exports = {
  MODULE_KEY,
  DEFAULT_STATS,
  dayKey,
  getStats,
  saveStats,
  updateStats,
  setEnabled,
  isEnabled,
  addMessage,
  addVoiceMinutes,
  addMemberEvent,
  resetStats,
  getSummary,
};
