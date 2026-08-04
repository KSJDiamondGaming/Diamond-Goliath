'use strict';

const guildManager = require('../../../core/guild/guildManager');

const SECTION = 'social';

function object(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSection(input = {}) {
  const section = object(input);

  return {
    ...section,
    alertsChannelId: section.alertsChannelId || null,
    alertChannels: object(section.alertChannels),
    managerRoleIds: array(section.managerRoleIds).map(String),
    userRoleIds: array(section.userRoleIds).map(String),
    notificationMentionMode: ['none', 'role', 'everyone', 'here'].includes(section.notificationMentionMode)
      ? section.notificationMentionMode
      : 'none',
    notificationRoleId: section.notificationRoleId || null,
    creators: object(section.creators),
    accounts: object(section.accounts),
    settings: object(section.settings),
    templates: object(section.templates),
    history: array(section.history),
    queue: array(section.queue),
    analytics: object(section.analytics),
  };
}

function getSection(guildId) {
  return normalizeSection(guildManager.getGuildSection(guildId, SECTION, {}));
}

function saveSection(guildId, section, meta = {}) {
  const normalized = normalizeSection(section);
  const saved = guildManager.saveGuildSection(guildId, SECTION, normalized, {
    guildId,
    ...object(meta),
  });

  if (!saved || typeof saved !== 'object') {
    throw new Error('Social Studio could not verify its saved guild data.');
  }

  return normalizeSection(saved);
}

function updateSection(guildId, updater, meta = {}) {
  const current = getSection(guildId);
  const next = typeof updater === 'function'
    ? updater(current)
    : { ...current, ...object(updater) };

  return saveSection(guildId, next, meta);
}

function isEnabled(guildId) {
  return guildManager.isModuleEnabled(guildId, SECTION);
}

function setEnabled(guildId, enabled, meta = {}) {
  guildManager.setModuleEnabled(guildId, SECTION, enabled === true, meta);
  return isEnabled(guildId);
}

module.exports = {
  SECTION,
  normalizeSection,
  getSection,
  saveSection,
  updateSection,
  isEnabled,
  setEnabled,
};
