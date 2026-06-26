'use strict';

// src/modules/tempvoice/tempVoiceStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  updateGuildSection,
} = require('../../core/guild/guildManager');

const SECTION = 'tempVoice';
const MODULES_SECTION = 'modules';

function now() {
  return new Date().toISOString();
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanString(value, fallback = '', maxLength = 100) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanNonNegativeInt(value, fallback = 0) {
  return Math.max(0, Math.floor(cleanNumber(value, fallback)));
}

function cleanDiscordIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function createId(prefix = 'tempvoice') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function defaultTempVoiceSection() {
  return {
    enabled: true,
    hubs: {},
    channels: {},
    settings: {
      defaultUserLimit: 0,
      deleteWhenEmpty: true,
      ownerPanelEnabled: true,
      allowOwnerRename: true,
      allowOwnerStatus: true,
      allowOwnerLock: true,
      allowOwnerHide: true,
      allowOwnerLimit: true,
      allowOwnerPermits: true,
      allowOwnerTransfer: true,
      allowOwnerDelete: true,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeHub(hub = {}) {
  const hubId = cleanString(hub.hubId || hub.id || createId('tv_hub'), 'tv_hub', 80);

  return {
    hubId,
    id: hubId,
    enabled: hub.enabled !== false,
    joinChannelId: cleanDiscordId(hub.joinChannelId),
    joinChannelName: cleanString(hub.joinChannelName || hub.name || '➕ Create Temp Voice', '➕ Create Temp Voice', 80),
    categoryId: cleanDiscordId(hub.categoryId),
    categoryName: cleanString(hub.categoryName || 'Temporary Voice Channels', 'Temporary Voice Channels', 80),
    nameTemplate: cleanString(hub.nameTemplate || '{username}\'s Channel', '{username}\'s Channel', 80),
    userLimit: cleanNonNegativeInt(hub.userLimit, 0),
    bitrate: cleanNonNegativeInt(hub.bitrate, 0),
    lockedByDefault: hub.lockedByDefault === true,
    hiddenByDefault: hub.hiddenByDefault === true,
    ownerControlsEnabled: hub.ownerControlsEnabled !== false,
    createdBy: cleanDiscordId(hub.createdBy),
    createdAt: hub.createdAt || now(),
    updatedAt: hub.updatedAt || hub.createdAt || now(),
  };
}

function normalizeChannel(channel = {}) {
  return {
    channelId: cleanDiscordId(channel.channelId),
    ownerId: cleanDiscordId(channel.ownerId),
    hubId: cleanString(channel.hubId || '', '', 80) || null,
    guildId: cleanDiscordId(channel.guildId),
    name: cleanString(channel.name || '', '', 80),
    activityStatus: cleanString(channel.activityStatus || '', '', 120),
    userLimit: cleanNonNegativeInt(channel.userLimit, 0),
    locked: channel.locked === true,
    hidden: channel.hidden === true,
    allowedUserIds: cleanDiscordIdArray(channel.allowedUserIds),
    blockedUserIds: cleanDiscordIdArray(channel.blockedUserIds),
    allowedRoleIds: cleanDiscordIdArray(channel.allowedRoleIds),
    blockedRoleIds: cleanDiscordIdArray(channel.blockedRoleIds),
    controlMessageId: cleanDiscordId(channel.controlMessageId),
    createdAt: channel.createdAt || now(),
    updatedAt: channel.updatedAt || channel.createdAt || now(),
  };
}

function normalizeSection(section = {}) {
  const base = defaultTempVoiceSection();
  const source = section && typeof section === 'object' ? section : {};
  const hubs = source.hubs && typeof source.hubs === 'object' ? source.hubs : {};
  const channels = source.channels && typeof source.channels === 'object' ? source.channels : {};

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    settings: {
      ...base.settings,
      ...(source.settings || {}),
      defaultUserLimit: cleanNonNegativeInt(source.settings?.defaultUserLimit, 0),
      deleteWhenEmpty: source.settings?.deleteWhenEmpty !== false,
      ownerPanelEnabled: source.settings?.ownerPanelEnabled !== false,
      allowOwnerRename: source.settings?.allowOwnerRename !== false,
      allowOwnerStatus: source.settings?.allowOwnerStatus !== false,
      allowOwnerLock: source.settings?.allowOwnerLock !== false,
      allowOwnerHide: source.settings?.allowOwnerHide !== false,
      allowOwnerLimit: source.settings?.allowOwnerLimit !== false,
      allowOwnerPermits: source.settings?.allowOwnerPermits !== false,
      allowOwnerTransfer: source.settings?.allowOwnerTransfer !== false,
      allowOwnerDelete: source.settings?.allowOwnerDelete !== false,
    },
    hubs: Object.fromEntries(
      Object.entries(hubs)
        .map(([id, hub]) => {
          const normalized = normalizeHub({ ...hub, hubId: hub.hubId || id });
          return [normalized.hubId, normalized];
        })
        .filter(([, hub]) => hub.joinChannelId)
    ),
    channels: Object.fromEntries(
      Object.entries(channels)
        .map(([id, channel]) => {
          const normalized = normalizeChannel({ ...channel, channelId: channel.channelId || id });
          return [normalized.channelId, normalized];
        })
        .filter(([, channel]) => channel.channelId && channel.ownerId)
    ),
    updatedAt: source.updatedAt || now(),
  };
}

function getModules(guildId) {
  const modules = getGuildSection(guildId, MODULES_SECTION, {});
  return modules && typeof modules === 'object' ? modules : {};
}

function getTempVoiceSection(guildId) {
  return normalizeSection(getModules(guildId)[SECTION] || defaultTempVoiceSection());
}

function saveTempVoiceSection(guildId, section, meta = {}) {
  const normalized = normalizeSection(section);

  updateGuildSection(
    guildId,
    MODULES_SECTION,
    (modules = {}) => ({
      ...(modules && typeof modules === 'object' ? modules : {}),
      [SECTION]: normalized,
    }),
    {},
    meta
  );

  return normalized;
}

function updateTempVoiceSection(guildId, updater, meta = {}) {
  const current = getTempVoiceSection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveTempVoiceSection(guildId, normalizeSection(next), meta);
}

function getHubs(guildId) {
  return Object.values(getTempVoiceSection(guildId).hubs || {});
}

function getHub(guildId, hubId) {
  return getTempVoiceSection(guildId).hubs?.[hubId] || null;
}

function saveHub(guildId, hub, meta = {}) {
  const normalized = normalizeHub(hub);

  return updateTempVoiceSection(
    guildId,
    (section) => ({
      ...section,
      hubs: {
        ...(section.hubs || {}),
        [normalized.hubId]: {
          ...(section.hubs?.[normalized.hubId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }),
    meta
  ).hubs[normalized.hubId];
}

function findHubByJoinChannel(guildId, channelId) {
  return getHubs(guildId).find(
    (hub) => hub.enabled !== false && hub.joinChannelId === channelId
  ) || null;
}

function saveTempChannel(guildId, channel, meta = {}) {
  const normalized = normalizeChannel({ ...channel, guildId });

  return updateTempVoiceSection(
    guildId,
    (section) => ({
      ...section,
      channels: {
        ...(section.channels || {}),
        [normalized.channelId]: {
          ...(section.channels?.[normalized.channelId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }),
    meta
  ).channels[normalized.channelId];
}

function getTempChannel(guildId, channelId) {
  return getTempVoiceSection(guildId).channels?.[channelId] || null;
}

function updateTempChannel(guildId, channelId, updater, meta = {}) {
  return updateTempVoiceSection(
    guildId,
    (section) => {
      const current = section.channels?.[channelId];
      if (!current) return section;
      const next = typeof updater === 'function' ? updater(current) : updater;

      return {
        ...section,
        channels: {
          ...(section.channels || {}),
          [channelId]: normalizeChannel({ ...current, ...next, channelId, updatedAt: now() }),
        },
        updatedAt: now(),
      };
    },
    meta
  ).channels?.[channelId] || null;
}

function deleteTempChannel(guildId, channelId, meta = {}) {
  return updateTempVoiceSection(
    guildId,
    (section) => {
      const channels = { ...(section.channels || {}) };
      delete channels[channelId];

      return {
        ...section,
        channels,
        updatedAt: now(),
      };
    },
    meta
  );
}

module.exports = {
  SECTION,
  now,
  cleanDiscordId,
  createId,
  defaultTempVoiceSection,
  normalizeSection,
  getTempVoiceSection,
  saveTempVoiceSection,
  updateTempVoiceSection,
  getHubs,
  getHub,
  saveHub,
  findHubByJoinChannel,
  saveTempChannel,
  getTempChannel,
  updateTempChannel,
  deleteTempChannel,
};
