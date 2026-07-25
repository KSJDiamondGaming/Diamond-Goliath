'use strict';

const crypto = require('crypto');
const guildManager = require('../../../core/guild/guildManager');

const MODULE_KEY = 'giveaways';

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

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function defaultGiveawaysSection() {
  return {
    enabled: true,
    announcementChannelId: null,
    logChannelId: null,
    managerRoleIds: [],
    allowMultipleEntries: false,
    requireRole: false,
    requiredRoleIds: [],
    pingWinners: true,
    giveaways: {},
    analytics: {
      created: 0,
      ended: 0,
      entries: 0,
      rerolls: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeGiveaway(input = {}) {
  const giveawayId = cleanString(input.giveawayId || input.id || createId('gw'), 'gw', 80);
  return {
    giveawayId,
    id: giveawayId,
    status: ['draft', 'active', 'ended', 'cancelled'].includes(input.status) ? input.status : 'active',
    prize: cleanString(input.prize || 'Mystery Prize', 'Mystery Prize', 200),
    description: cleanString(input.description || '', '', 1000),
    winnerCount: Math.max(1, Math.min(20, Math.floor(cleanNumber(input.winnerCount, 1)))),
    endsAt: input.endsAt || null,
    channelId: cleanDiscordId(input.channelId),
    messageId: cleanDiscordId(input.messageId),
    createdBy: cleanDiscordId(input.createdBy),
    entries: cleanIdArray(input.entries),
    winners: cleanIdArray(input.winners),
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || input.createdAt || now(),
    endedAt: input.endedAt || null,
  };
}

function normalizeSection(section = {}) {
  const base = defaultGiveawaysSection();
  const source = section && typeof section === 'object' ? section : {};
  const giveaways = source.giveaways && typeof source.giveaways === 'object' ? source.giveaways : {};

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    announcementChannelId: cleanDiscordId(source.announcementChannelId),
    logChannelId: cleanDiscordId(source.logChannelId),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    allowMultipleEntries: source.allowMultipleEntries === true,
    requireRole: source.requireRole === true,
    requiredRoleIds: cleanIdArray(source.requiredRoleIds),
    pingWinners: source.pingWinners !== false,
    giveaways: Object.fromEntries(
      Object.entries(giveaways).map(([id, giveaway]) => {
        const normalized = normalizeGiveaway({ ...giveaway, giveawayId: giveaway.giveawayId || id });
        return [normalized.giveawayId, normalized];
      })
    ),
    analytics: {
      created: Math.max(0, Number(source.analytics?.created || 0)),
      ended: Math.max(0, Number(source.analytics?.ended || 0)),
      entries: Math.max(0, Number(source.analytics?.entries || 0)),
      rerolls: Math.max(0, Number(source.analytics?.rerolls || 0)),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function getSection(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return normalizeSection(modules?.[MODULE_KEY] || defaultGiveawaysSection());
}

function saveSection(guildId, section, guildOrMeta = {}) {
  const normalized = normalizeSection(section);
  guildManager.updateGuildSection(guildId, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    [MODULE_KEY]: normalized,
  }), {}, guildOrMeta);
  return normalized;
}

function updateSection(guildId, updater, guildOrMeta = {}) {
  const current = getSection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveSection(guildId, normalizeSection(next), guildOrMeta);
}

function saveGiveaway(guildId, giveaway, guildOrMeta = {}) {
  const normalized = normalizeGiveaway(giveaway);
  return updateSection(guildId, (section) => ({
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
  }), guildOrMeta).giveaways[normalized.giveawayId];
}

function getGiveaway(guildId, giveawayId) {
  return getSection(guildId).giveaways?.[cleanString(giveawayId, '', 80)] || null;
}

function updateGiveaway(guildId, giveawayId, updater, guildOrMeta = {}) {
  return updateSection(guildId, (section) => {
    const current = section.giveaways?.[giveawayId];
    if (!current) return section;
    const next = typeof updater === 'function' ? updater(current) : updater;
    return {
      ...section,
      giveaways: {
        ...(section.giveaways || {}),
        [giveawayId]: normalizeGiveaway({ ...current, ...next, giveawayId, updatedAt: now() }),
      },
      updatedAt: now(),
    };
  }, guildOrMeta).giveaways?.[giveawayId] || null;
}

function incrementAnalytics(guildId, changes = {}, guildOrMeta = {}) {
  return updateSection(guildId, (section) => ({
    ...section,
    analytics: {
      created: section.analytics.created + Math.max(0, Number(changes.created || 0)),
      ended: section.analytics.ended + Math.max(0, Number(changes.ended || 0)),
      entries: section.analytics.entries + Math.max(0, Number(changes.entries || 0)),
      rerolls: section.analytics.rerolls + Math.max(0, Number(changes.rerolls || 0)),
    },
    updatedAt: now(),
  }), guildOrMeta).analytics;
}

module.exports = {
  MODULE_KEY,
  now,
  createId,
  cleanDiscordId,
  defaultGiveawaysSection,
  normalizeSection,
  normalizeGiveaway,
  getSection,
  saveSection,
  updateSection,
  saveGiveaway,
  getGiveaway,
  updateGiveaway,
  incrementAnalytics,
};
