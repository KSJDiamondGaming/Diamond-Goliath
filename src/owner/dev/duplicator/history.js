'use strict';

const guildManager = require('../../../core/guild/guildManager');

const MAX_HISTORY = 100;

function readConfig(controlGuildId) {
  const modules = guildManager.getGuildSection(controlGuildId, 'modules', {});
  const duplicator = modules.duplicator || {};
  const transferHistory = Array.isArray(duplicator.transferHistory) ? duplicator.transferHistory : [];
  return { modules, duplicator, transferHistory };
}

function saveHistory(controlGuildId, history, guildOrMeta = {}) {
  const { modules, duplicator } = readConfig(controlGuildId);
  const next = history.slice(0, MAX_HISTORY);
  guildManager.replaceGuildSection(controlGuildId, 'modules', {
    ...modules,
    duplicator: {
      ...duplicator,
      transferHistory: next,
    },
  }, guildOrMeta);
  return next;
}

function makeId(prefix = 'TR') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function add(controlGuildId, manifest, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const entry = {
    id: manifest.id || makeId(manifest.type === 'bulk-delete' ? 'DEL' : 'TR'),
    createdAt: manifest.createdAt || new Date().toISOString(),
    ...manifest,
  };
  saveHistory(controlGuildId, [entry, ...transferHistory.filter((item) => item?.id !== entry.id)], guildOrMeta);
  return entry;
}

function list(controlGuildId, limit = 25) {
  return readConfig(controlGuildId).transferHistory.slice(0, Math.max(1, Math.min(100, limit)));
}

function get(controlGuildId, id) {
  return readConfig(controlGuildId).transferHistory.find((item) => item?.id === id) || null;
}

function update(controlGuildId, id, patch, guildOrMeta = {}) {
  const { transferHistory } = readConfig(controlGuildId);
  const index = transferHistory.findIndex((item) => item?.id === id);
  if (index < 0) return null;
  const nextEntry = { ...transferHistory[index], ...(patch || {}), updatedAt: new Date().toISOString() };
  const next = [...transferHistory];
  next[index] = nextEntry;
  saveHistory(controlGuildId, next, guildOrMeta);
  return nextEntry;
}

module.exports = { add, list, get, update, makeId };
