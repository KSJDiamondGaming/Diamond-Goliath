'use strict';

const fs = require('fs');
const path = require('path');
const { getRuntimePaths } = require('../../config/runtimePaths');

const paths = getRuntimePaths(process.env.BOT_MODE || 'DEV');
const root = path.join(paths.data, 'audit');

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { ensure(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }

function appendEvent(event) {
  const guildId = String(event.guildId || 'system');
  const file = path.join(ensure(path.join(root, 'events', guildId)), `${monthKey(new Date(event.timestamp || Date.now()))}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
  updateGuildIndex(event);
  if (event.user?.id) updateUserIndex(event.user.id, event);
  if (event.actor?.id && event.actor.id !== event.user?.id) updateUserIndex(event.actor.id, { ...event, relation: 'actor' });
  return event;
}

function updateGuildIndex(event) {
  if (!event.guildId) return;
  const file = path.join(root, 'guilds', `${event.guildId}.json`);
  const current = readJson(file, { guildId: event.guildId, guildName: event.guildName || null, firstObservedAt: event.timestamp, eventCount: 0, lastEventAt: null });
  current.guildName = event.guildName || current.guildName;
  current.eventCount = Number(current.eventCount || 0) + 1;
  current.lastEventAt = event.timestamp;
  writeJson(file, current);
}

function updateUserIndex(userId, event) {
  const file = path.join(root, 'users', `${userId}.json`);
  const current = readJson(file, { userId, firstObservedAt: event.timestamp, lastObservedAt: null, eventCount: 0, names: [], guilds: {} });
  const user = event.user?.id === userId ? event.user : event.actor?.id === userId ? event.actor : null;
  if (user?.username && !current.names.includes(user.username)) current.names.push(user.username);
  current.names = current.names.slice(-25);
  current.eventCount = Number(current.eventCount || 0) + 1;
  current.lastObservedAt = event.timestamp;
  if (event.guildId) {
    const guild = current.guilds[event.guildId] || { guildId: event.guildId, guildName: event.guildName || null, firstObservedAt: event.timestamp, lastObservedAt: null, eventCount: 0 };
    guild.guildName = event.guildName || guild.guildName;
    guild.lastObservedAt = event.timestamp;
    guild.eventCount = Number(guild.eventCount || 0) + 1;
    current.guilds[event.guildId] = guild;
  }
  writeJson(file, current);
}

function getUser(userId) { return readJson(path.join(root, 'users', `${String(userId)}.json`), null); }
function getGuild(guildId) { return readJson(path.join(root, 'guilds', `${String(guildId)}.json`), null); }
function getRoot() { return root; }

module.exports = { appendEvent, getUser, getGuild, getRoot };
