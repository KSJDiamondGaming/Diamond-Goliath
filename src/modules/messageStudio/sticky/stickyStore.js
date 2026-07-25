'use strict';

const guildManager = require('../../../core/guild/guildManager');

const MODULE_KEY = 'sticky';

function now() {
  return new Date().toISOString();
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanDiscordId).filter(Boolean))];
}

function cleanString(value, fallback = '', maxLength = 1800) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function defaultStickySection() {
  return {
    enabled: true,
    channels: [],
    managerRoleIds: [],
    mode: 'per-channel',
    cleanupPrevious: true,
    allowEmbeds: true,
    message: '📌 Sticky message configured by Goliath.',
    posts: {},
    analytics: {
      deployed: 0,
      refreshed: 0,
      cleaned: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizePost(input = {}) {
  const channelId = cleanDiscordId(input.channelId || input.id);
  return {
    channelId,
    id: channelId,
    messageId: cleanDiscordId(input.messageId),
    content: cleanString(input.content || '', '', 1800),
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || input.createdAt || now(),
  };
}

function normalizeSection(section = {}) {
  const base = defaultStickySection();
  const source = section && typeof section === 'object' ? section : {};
  const posts = source.posts && typeof source.posts === 'object' ? source.posts : {};

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    channels: cleanIdArray(source.channels),
    managerRoleIds: cleanIdArray(source.managerRoleIds),
    mode: ['per-channel', 'manual'].includes(source.mode) ? source.mode : 'per-channel',
    cleanupPrevious: source.cleanupPrevious !== false,
    allowEmbeds: source.allowEmbeds !== false,
    message: cleanString(source.message || base.message, base.message, 1800),
    posts: Object.fromEntries(Object.entries(posts)
      .map(([id, post]) => normalizePost({ ...post, channelId: post.channelId || id }))
      .filter((post) => post.channelId)
      .map((post) => [post.channelId, post])),
    analytics: {
      deployed: Math.max(0, Number(source.analytics?.deployed || 0)),
      refreshed: Math.max(0, Number(source.analytics?.refreshed || 0)),
      cleaned: Math.max(0, Number(source.analytics?.cleaned || 0)),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function getSection(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  return normalizeSection(modules?.[MODULE_KEY] || defaultStickySection());
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

function savePost(guildId, post, guildOrMeta = {}) {
  const normalized = normalizePost(post);
  return updateSection(guildId, (section) => ({
    ...section,
    posts: {
      ...(section.posts || {}),
      [normalized.channelId]: { ...(section.posts?.[normalized.channelId] || {}), ...normalized, updatedAt: now() },
    },
    updatedAt: now(),
  }), guildOrMeta).posts[normalized.channelId];
}

function getPost(guildId, channelId) {
  return getSection(guildId).posts?.[cleanDiscordId(channelId)] || null;
}

function incrementAnalytics(guildId, changes = {}, guildOrMeta = {}) {
  return updateSection(guildId, (section) => ({
    ...section,
    analytics: {
      deployed: section.analytics.deployed + Math.max(0, Number(changes.deployed || 0)),
      refreshed: section.analytics.refreshed + Math.max(0, Number(changes.refreshed || 0)),
      cleaned: section.analytics.cleaned + Math.max(0, Number(changes.cleaned || 0)),
    },
    updatedAt: now(),
  }), guildOrMeta).analytics;
}

module.exports = {
  MODULE_KEY,
  now,
  defaultStickySection,
  normalizeSection,
  getSection,
  saveSection,
  updateSection,
  savePost,
  getPost,
  incrementAnalytics,
};
