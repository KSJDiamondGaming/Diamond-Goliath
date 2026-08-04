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

function getCreator(guildId, creatorId) {
  return getSection(guildId).creators[String(creatorId)] || null;
}

function findCreatorByOwner(guildId, ownerDiscordId) {
  const ownerId = String(ownerDiscordId || '');
  if (!ownerId) return null;

  return Object.values(getSection(guildId).creators)
    .find((creator) => String(creator?.ownerDiscordId || '') === ownerId) || null;
}

function getCreatorAccounts(guildId, creatorOrId) {
  const section = getSection(guildId);
  const creator = typeof creatorOrId === 'object'
    ? creatorOrId
    : section.creators[String(creatorOrId)] || null;

  if (!creator) return [];

  return array(creator.accountIds)
    .map((accountId) => section.accounts[String(accountId)])
    .filter(Boolean);
}

function updateCreator(guildId, creatorId, updater, meta = {}) {
  let savedCreator = null;

  updateSection(guildId, (section) => {
    const current = section.creators[String(creatorId)];
    if (!current) throw new Error('Creator profile was not found.');

    const next = typeof updater === 'function'
      ? updater({ ...current })
      : { ...current, ...object(updater) };

    next.creatorId = current.creatorId;
    next.ownerDiscordId = current.ownerDiscordId || next.ownerDiscordId || null;
    next.updatedAt = new Date().toISOString();
    section.creators[String(creatorId)] = next;
    savedCreator = next;
    return section;
  }, meta);

  return savedCreator;
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
  getConfig: getSection,
  saveSection,
  saveConfig: saveSection,
  updateSection,
  getCreator,
  findCreatorByOwner,
  getCreatorAccounts,
  updateCreator,
  isEnabled,
  setEnabled,
};
