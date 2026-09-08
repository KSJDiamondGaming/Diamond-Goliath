'use strict';

const { GuildChannel } = require('discord.js');
const history = require('./history');

const INSTALL_KEY = Symbol.for('goliath.duplicator.history-hardening-v1');
const DELETE_ERROR_KEY = Symbol.for('goliath.duplicator.bulk-delete-error-hardening-v1');

function createdObjectCount(record) {
  const objects = record?.transferObjects || {};
  return [
    ...(objects.createdRoleIds || []),
    ...(objects.createdCategoryIds || []),
    ...(objects.createdChannelIds || []),
  ].filter(Boolean).length;
}

function normaliseRequiredAction(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  if (!/administrator/i.test(text)) return text;
  return 'Restore Goliath\'s Manage Channels access on every blocked channel/category, then retry. If an overwrite caused the lockout, Goliath will attempt its least-privilege bot-only control repair when Manage Roles is available. No Administrator permission is required or requested.';
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const next = { ...record };

  if (next.type === 'bulk-delete') {
    next.requiredAction = normaliseRequiredAction(next.requiredAction);
    next.noAdministratorRequired = true;

    if (next.blockedPreflight && Number(next.deletedCount || 0) === 0) {
      next.mutationStarted = false;
      next.safeToClearHistory = true;
    }

    if (Number(next.deletedCount || 0) === 0 && !(next.failed || []).length && !(next.missing || []).length) {
      next.safeToClearHistory = true;
    }
  }

  if (next.type === 'selective-copy') {
    const outcome = String(next.outcome || next.status || '').toLowerCase();
    if (['failed', 'blocked-preflight', 'no-changes'].includes(outcome) && createdObjectCount(next) === 0) {
      next.mutationStarted = false;
      next.safeToClearHistory = true;
    }
    if (outcome === 'undone' || String(next.status || '').toLowerCase() === 'undone') {
      next.safeToClearHistory = true;
    }
  }

  return next;
}

function installHistoryHardening() {
  if (history[INSTALL_KEY]) return;
  Object.defineProperty(history, INSTALL_KEY, { value: true });

  const originalAdd = history.add.bind(history);
  const originalList = history.list.bind(history);
  const originalGet = history.get.bind(history);
  const originalUpdate = history.update.bind(history);

  history.add = function hardenedAdd(controlGuildId, manifest, guildOrMeta) {
    return normalizeRecord(originalAdd(controlGuildId, normalizeRecord(manifest), guildOrMeta));
  };
  history.list = function hardenedList(controlGuildId, limit) {
    return originalList(controlGuildId, limit).map(normalizeRecord);
  };
  history.get = function hardenedGet(controlGuildId, id) {
    return normalizeRecord(originalGet(controlGuildId, id));
  };
  history.update = function hardenedUpdate(controlGuildId, id, patch, guildOrMeta) {
    return normalizeRecord(originalUpdate(controlGuildId, id, normalizeRecord(patch), guildOrMeta));
  };
}

function installDeleteErrorHardening() {
  if (!GuildChannel?.prototype?.delete || GuildChannel.prototype[DELETE_ERROR_KEY]) return;
  const previousDelete = GuildChannel.prototype.delete;
  Object.defineProperty(GuildChannel.prototype, DELETE_ERROR_KEY, { value: true });

  GuildChannel.prototype.delete = async function hardenedDuplicatorDelete(reason) {
    try {
      return await previousDelete.call(this, reason);
    } catch (error) {
      if (!String(reason || '').startsWith('Goliath Duplicator bulk delete')) throw error;
      if (!/administrator/i.test(String(error?.message || ''))) throw error;

      const wrapped = new Error(String(error.message).replace(/Administrator[^.]*\.?/gi, 'Manage Channels access is required; Administrator is not requested.'));
      wrapped.code = error.code;
      wrapped.cause = error;
      throw wrapped;
    }
  };
}

function install() {
  installHistoryHardening();
  installDeleteErrorHardening();
}

module.exports = {
  install,
  normalizeRecord,
  normaliseRequiredAction,
  createdObjectCount,
};
