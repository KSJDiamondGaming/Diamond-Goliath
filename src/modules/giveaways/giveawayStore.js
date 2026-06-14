'use strict';

// src/modules/giveaways/giveawayStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  updateGuildSection,
} = require('../../guild/guildManager');

const SECTION = 'giveaways';
const MODULES_SECTION = 'modules';

function now() {
  return new Date().toISOString();
}

function createId(prefix = 'giveaway') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanPositiveInt(value, fallback = 1) {
  return Math.max(1, Math.floor(cleanNumber(value, fallback)));
}

function asArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
}

function defaultGiveawaySection() {
  return {
    enabled: true,
    giveaways: {},
    settings: {
      defaultWinnerCount: 1,
      allowBotEntries: false,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeGiveaway(giveaway = {}) {
  const giveawayId = cleanString(giveaway.giveawayId || giveaway.id || createId('gw'), 'gw', 80);
  const winnerCount = cleanPositiveInt(giveaway.winnerCount, 1);

  return {
    giveawayId,
    id: giveawayId,
    enabled: giveaway.enabled !== false,
    status: ['active', 'ended', 'cancelled'].includes(giveaway.status) ? giveaway.status : 'active',
    prize: cleanString(giveaway.prize || 'Mystery Prize', 'Mystery Prize', 200),
    description: cleanString(giveaway.description || '', '', 1000),
    channelId: cleanDiscordId(giveaway.channelId),
    messageId: cleanDiscordId(giveaway.messageId),
    hostId: cleanDiscordId(giveaway.hostId),
    winnerCount,
    endsAt: giveaway.endsAt || null,
    entries: asArray(giveaway.entries),
    winners: asArray(giveaway.winners),
    requiredRoleIds: asArray(giveaway.requiredRoleIds).map(cleanDiscordId).filter(Boolean),
    blockedRoleIds: asArray(giveaway.blockedRoleIds).map(cleanDiscordId).filter(Boolean),
    createdAt: giveaway.createdAt || now(),
    updatedAt: giveaway.updatedAt || giveaway.createdAt || now(),
    endedAt: giveaway.endedAt || null,
  };
}

function normalizeSection(section = {}) {
  const base = defaultGiveawaySection();
  const source = section && typeof section === 'object' ? section : {};
  const giveaways = source.giveaways && typeof source.giveaways === 'object' ? source.giveaways : {};

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    settings: {
      ...base.settings,
      ...(source.settings || {}),
      defaultWinnerCount: cleanPositiveInt(source.settings?.defaultWinnerCount, 1),
      allowBotEntries: source.settings?.allowBotEntries === true,
    },
    giveaways: Object.fromEntries(
      Object.entries(giveaways).map(([id, giveaway]) => {
        const normalized = normalizeGiveaway({ ...giveaway, giveawayId: giveaway.giveawayId || id });
        return [normalized.giveawayId, normalized];
      })
    ),
    updatedAt: source.updatedAt || now(),
  };
}

function getModules(guildId) {
  const modules = getGuildSection(guildId, MODULES_SECTION, {});
  return modules && typeof modules === 'object' ? modules : {};
}

function getGiveawaySection(guildId) {
  return normalizeSection(getModules(guildId)[SECTION] || defaultGiveawaySection());
}

function saveGiveawaySection(guildId, section, meta = {}) {
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

function updateGiveawaySection(guildId, updater, meta = {}) {
  const current = getGiveawaySection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveGiveawaySection(guildId, normalizeSection(next), meta);
}

function saveGiveaway(guildId, giveaway, meta = {}) {
  const normalized = normalizeGiveaway(giveaway);

  return updateGiveawaySection(
    guildId,
    (section) => ({
      ...section,
      giveaways: {
        ...(section.giveaways || {}),
        [normalized.giveawayId]: {
          ...(section.giveaways?.[normalized.giveawayId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }),
    meta
  ).giveaways[normalized.giveawayId];
}

function getGiveaway(guildId, giveawayId) {
  return getGiveawaySection(guildId).giveaways?.[giveawayId] || null;
}

function getGiveaways(guildId) {
  return Object.values(getGiveawaySection(guildId).giveaways || {});
}

function getActiveGiveaways(guildId) {
  return getGiveaways(guildId).filter((giveaway) => giveaway.status === 'active' && giveaway.enabled !== false);
}

function updateGiveaway(guildId, giveawayId, updates = {}, meta = {}) {
  const existing = getGiveaway(guildId, giveawayId);
  if (!existing) return null;

  return saveGiveaway(guildId, {
    ...existing,
    ...updates,
    giveawayId,
    updatedAt: now(),
  }, meta);
}

module.exports = {
  SECTION,
  now,
  createId,
  cleanDiscordId,
  defaultGiveawaySection,
  normalizeSection,
  normalizeGiveaway,
  getGiveawaySection,
  saveGiveawaySection,
  updateGiveawaySection,
  saveGiveaway,
  getGiveaway,
  getGiveaways,
  getActiveGiveaways,
  updateGiveaway,
};
