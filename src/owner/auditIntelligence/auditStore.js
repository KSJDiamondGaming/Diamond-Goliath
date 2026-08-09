'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getRuntimePaths } = require('../../config/runtimePaths');

const paths = getRuntimePaths(process.env.BOT_MODE || 'DEV');
const root = path.join(paths.data, 'audit');
const HISTORY_LIMIT = 100;
const LEGACY_CONFIG_FILE = path.join(root, 'config.json');
const SHARED_CONFIG_FILE = path.join(os.homedir(), '.goliath-audit-control.json');
const COMMAND_CENTER_GUILD_ID = '1515201360386068642';

function runtimeMode() {
  const mode = String(process.env.BOT_MODE || 'DEV').trim().toUpperCase();
  if (mode === 'PROD' || mode === 'PRODUCTION') return 'PRODUCTION';
  if (mode === 'BETA') return 'BETA';
  return 'DEV';
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { ensure(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }
function defaultConfig() {
  return {
    version: 1,
    commandCenter: {
      guildId: COMMAND_CENTER_GUILD_ID,
      categoryId: null,
      channelId: null,
      messageId: null,
      layoutMode: 'owner-managed',
      channelName: null,
      categoryName: null,
    },
    autoProvision: true,
    guilds: {},
  };
}
function normalizeConfig(current = {}) {
  return {
    ...defaultConfig(),
    ...current,
    commandCenter: {
      ...defaultConfig().commandCenter,
      ...(current.commandCenter || {}),
      guildId: COMMAND_CENTER_GUILD_ID,
    },
    guilds: current.guilds && typeof current.guilds === 'object' ? current.guilds : {},
  };
}
function bootstrapSharedConfig() {
  if (fs.existsSync(SHARED_CONFIG_FILE)) return;
  if (runtimeMode() !== 'DEV') return;
  const legacy = readJson(LEGACY_CONFIG_FILE, null);
  writeJson(SHARED_CONFIG_FILE, normalizeConfig(legacy || defaultConfig()));
}
function getConfig() {
  bootstrapSharedConfig();
  if (fs.existsSync(SHARED_CONFIG_FILE)) return normalizeConfig(readJson(SHARED_CONFIG_FILE, defaultConfig()));
  return normalizeConfig(readJson(LEGACY_CONFIG_FILE, defaultConfig()));
}
function saveConfig(config) {
  const next = normalizeConfig(config || {});
  if (runtimeMode() === 'DEV') writeJson(SHARED_CONFIG_FILE, next);
  else if (!fs.existsSync(SHARED_CONFIG_FILE)) writeJson(LEGACY_CONFIG_FILE, next);
  return next;
}
function updateConfig(patch = {}) {
  const current = getConfig();
  const next = {
    ...current,
    ...patch,
    commandCenter: patch.commandCenter ? { ...current.commandCenter, ...patch.commandCenter, guildId: COMMAND_CENTER_GUILD_ID } : current.commandCenter,
    guilds: patch.guilds ? { ...current.guilds, ...patch.guilds } : current.guilds,
  };
  return saveConfig(next);
}
function pushUnique(items, value, key = (item) => JSON.stringify(item), limit = HISTORY_LIMIT) {
  if (value === undefined || value === null) return items;
  const list = Array.isArray(items) ? items : [];
  const identity = key(value);
  const filtered = list.filter((item) => key(item) !== identity);
  filtered.push(value);
  return filtered.slice(-limit);
}
function increment(map, key) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + 1;
}
function eventSummary(event) {
  return {
    eventId: event.eventId || null,
    timestamp: event.timestamp || null,
    type: event.type || 'unknown',
    category: event.category || 'system',
    action: event.action || 'observe',
    title: event.title || event.type || 'Audit Event',
    guildId: event.guildId || null,
    guildName: event.guildName || null,
    channelId: event.channel?.id || null,
    channelName: event.channel?.name || null,
    reason: event.reason || null,
    relation: event.relation || 'subject',
  };
}

function appendEvent(event) {
  const guildId = String(event.guildId || 'system');
  const file = path.join(ensure(path.join(root, 'events', guildId)), `${monthKey(new Date(event.timestamp || Date.now()))}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  updateGuildIndex(event);
  if (event.user?.id) updateUserIndex(event.user.id, event);
  if (event.actor?.id) {
    if (event.actor.id !== event.user?.id) updateUserIndex(event.actor.id, { ...event, relation: 'actor' });
    else updateActorHistoryOnly(event.actor.id, event);
  }
  return event;
}

function updateGuildIndex(event) {
  if (!event.guildId) return;
  const file = path.join(root, 'guilds', `${event.guildId}.json`);
  const current = readJson(file, {
    guildId: event.guildId,
    guildName: event.guildName || null,
    firstObservedAt: event.timestamp,
    eventCount: 0,
    lastEventAt: null,
    eventTypes: {},
    categories: {},
  });
  current.guildName = event.guildName || current.guildName;
  current.eventCount = Number(current.eventCount || 0) + 1;
  current.lastEventAt = event.timestamp;
  current.eventTypes ||= {};
  current.categories ||= {};
  increment(current.eventTypes, event.type || 'unknown');
  increment(current.categories, event.category || 'system');
  writeJson(file, current);
}

function updateIdentity(current, user, event) {
  if (!user) return;
  if (user.username) current.names = pushUnique(current.names, user.username, (value) => String(value).toLowerCase(), 25);
  if (user.globalName) current.globalNames = pushUnique(current.globalNames, user.globalName, (value) => String(value).toLowerCase(), 25);
  if (user.displayName) current.displayNames = pushUnique(current.displayNames, user.displayName, (value) => String(value).toLowerCase(), 25);
  if (user.nickname) {
    current.nicknames = pushUnique(current.nicknames, {
      guildId: event.guildId || null,
      guildName: event.guildName || null,
      nickname: user.nickname,
      observedAt: event.timestamp,
    }, (item) => `${item.guildId}:${String(item.nickname).toLowerCase()}`);
  }
  current.bot = Boolean(user.bot);
  current.accountCreatedAt = user.accountCreatedAt || current.accountCreatedAt || null;
}

function updateMembershipHistory(current, event, user) {
  if (!event.guildId || event.relation === 'actor') return;
  const guild = current.guilds[event.guildId] || {
    guildId: event.guildId,
    guildName: event.guildName || null,
    firstObservedAt: event.timestamp,
    lastObservedAt: null,
    eventCount: 0,
    firstJoinedAt: null,
    lastJoinedAt: null,
    lastLeftAt: null,
    joinCount: 0,
    leaveCount: 0,
    currentMember: null,
    eventTypes: {},
  };
  guild.guildName = event.guildName || guild.guildName;
  guild.lastObservedAt = event.timestamp;
  guild.eventCount = Number(guild.eventCount || 0) + 1;
  guild.eventTypes ||= {};
  increment(guild.eventTypes, event.type || 'unknown');
  const joinedAt = user?.joinedAt || event.after?.joinedAt || null;
  if (joinedAt && !guild.firstJoinedAt) guild.firstJoinedAt = joinedAt;
  if (event.type === 'member.join') {
    guild.currentMember = true;
    guild.joinCount = Number(guild.joinCount || 0) + 1;
    guild.lastJoinedAt = joinedAt || event.timestamp;
    if (!guild.firstJoinedAt) guild.firstJoinedAt = guild.lastJoinedAt;
    current.joinHistory = pushUnique(current.joinHistory, { guildId: event.guildId, guildName: event.guildName || null, joinedAt: guild.lastJoinedAt, eventId: event.eventId || null }, (item) => `${item.guildId}:${item.eventId || item.joinedAt}`);
  }
  if (['member.leave', 'member.kick', 'member.ban', 'member.prune'].includes(event.type)) {
    guild.currentMember = false;
    guild.leaveCount = Number(guild.leaveCount || 0) + 1;
    guild.lastLeftAt = event.timestamp;
    current.leaveHistory = pushUnique(current.leaveHistory, { guildId: event.guildId, guildName: event.guildName || null, leftAt: event.timestamp, type: event.type, reason: event.reason || null, actorId: event.actor?.id || null, eventId: event.eventId || null }, (item) => `${item.guildId}:${item.eventId || item.leftAt}`);
  }
  current.guilds[event.guildId] = guild;
}

function updateRoleHistory(current, event) {
  if (!event.guildId || event.relation === 'actor') return;
  if (!['member.role.add', 'member.role.remove', 'member.roles'].includes(event.type)) return;
  current.roleHistory = pushUnique(current.roleHistory, { guildId: event.guildId, guildName: event.guildName || null, timestamp: event.timestamp, type: event.type, before: event.before || null, after: event.after || null, actorId: event.actor?.id || null, reason: event.reason || null, eventId: event.eventId || null }, (item) => item.eventId || `${item.guildId}:${item.timestamp}:${item.type}`);
}
function updateModerationHistory(current, event) {
  if (event.relation === 'actor') return;
  if (event.category !== 'moderation' && !/^member\.(ban|unban|kick|timeout|prune)/.test(String(event.type || ''))) return;
  current.moderationHistory = pushUnique(current.moderationHistory, { guildId: event.guildId || null, guildName: event.guildName || null, timestamp: event.timestamp, type: event.type, title: event.title || null, actorId: event.actor?.id || null, actorName: event.actor?.globalName || event.actor?.username || null, reason: event.reason || null, before: event.before || null, after: event.after || null, eventId: event.eventId || null }, (item) => item.eventId || `${item.guildId}:${item.timestamp}:${item.type}`);
}
function updateVoiceHistory(current, event) {
  if (event.relation === 'actor' || event.category !== 'voice') return;
  current.voiceHistory = pushUnique(current.voiceHistory, { guildId: event.guildId || null, guildName: event.guildName || null, timestamp: event.timestamp, type: event.type, before: event.before || null, after: event.after || null, eventId: event.eventId || null }, (item) => item.eventId || `${item.guildId}:${item.timestamp}`);
}
function updateActorHistory(current, event) {
  if (event.relation !== 'actor') return;
  current.actorHistory = pushUnique(current.actorHistory, { guildId: event.guildId || null, guildName: event.guildName || null, timestamp: event.timestamp, type: event.type || 'unknown', category: event.category || 'system', action: event.action || 'observe', title: event.title || event.type || 'Audit Event', target: event.target || (event.user?.id ? { id: event.user.id, label: event.user.globalName || event.user.username || event.user.id } : null), channelId: event.channel?.id || null, channelName: event.channel?.name || null, reason: event.reason || null, source: event.source || null, result: event.result || null, actorSnapshot: event.actor || null, auditLogId: event.metadata?.auditLog?.auditLogId || null, operationId: event.metadata?.operation?.operationId || null, eventId: event.eventId || null }, (item) => item.eventId || `${item.guildId}:${item.timestamp}:${item.type}`, HISTORY_LIMIT);
}
function updateActorHistoryOnly(userId, event) {
  const file = path.join(root, 'users', `${userId}.json`);
  const current = readJson(file, null);
  if (!current) return updateUserIndex(userId, { ...event, relation: 'actor' });
  current.actorHistory ||= [];
  current.relations ||= { subject: 0, actor: 0 };
  increment(current.relations, 'actor');
  current.lastObservedAt = event.timestamp || current.lastObservedAt || null;
  updateActorHistory(current, { ...event, relation: 'actor' });
  writeJson(file, current);
}
function updateUserIndex(userId, event) {
  const file = path.join(root, 'users', `${userId}.json`);
  const current = readJson(file, { userId, firstObservedAt: event.timestamp, lastObservedAt: null, eventCount: 0, names: [], globalNames: [], displayNames: [], nicknames: [], guilds: {}, eventTypes: {}, categories: {}, relations: { subject: 0, actor: 0 }, joinHistory: [], leaveHistory: [], roleHistory: [], moderationHistory: [], voiceHistory: [], actorHistory: [], recentEvents: [] });
  const user = event.user?.id === userId ? event.user : event.actor?.id === userId ? event.actor : null;
  current.firstObservedAt ||= event.timestamp;
  current.lastObservedAt = event.timestamp;
  current.eventCount = Number(current.eventCount || 0) + 1;
  current.eventTypes ||= {};
  current.categories ||= {};
  current.relations ||= { subject: 0, actor: 0 };
  current.actorHistory ||= [];
  increment(current.eventTypes, event.type || 'unknown');
  increment(current.categories, event.category || 'system');
  increment(current.relations, event.relation === 'actor' ? 'actor' : 'subject');
  updateIdentity(current, user, event);
  updateMembershipHistory(current, event, user);
  updateRoleHistory(current, event);
  updateModerationHistory(current, event);
  updateVoiceHistory(current, event);
  updateActorHistory(current, event);
  current.recentEvents = pushUnique(current.recentEvents, eventSummary(event), (item) => item.eventId || `${item.timestamp}:${item.type}`, 50);
  writeJson(file, current);
}

function getUser(userId) { return readJson(path.join(root, 'users', `${String(userId)}.json`), null); }
function getGuild(guildId) { return readJson(path.join(root, 'guilds', `${String(guildId)}.json`), null); }
function getGuildEvents(guildId, options = {}) {
  const dir = path.join(root, 'events', String(guildId || ''));
  if (!guildId || !fs.existsSync(dir)) return [];
  const limit = Math.min(100, Math.max(1, Number(options.limit || 25)));
  const category = options.category ? String(options.category) : null;
  const prefix = options.typePrefix ? String(options.typePrefix) : null;
  const files = fs.readdirSync(dir).filter((name) => /^\d{4}-\d{2}\.jsonl$/.test(name)).sort().reverse();
  const found = [];
  for (const name of files) {
    const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (category && String(event.category || 'system') !== category) continue;
      if (prefix && !String(event.type || '').startsWith(prefix)) continue;
      found.push(event);
      if (found.length >= limit) return found;
    }
  }
  return found;
}
function getRoot() { return root; }
function getControlConfigPath() { return SHARED_CONFIG_FILE; }

module.exports = { appendEvent, getUser, getGuild, getGuildEvents, getRoot, getControlConfigPath, getConfig, saveConfig, updateConfig };
