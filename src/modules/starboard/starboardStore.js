'use strict';

// src/modules/starboard/starboardStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  updateGuildSection,
} = require('../../core/guild/guildManager');

const SECTION = 'starboard';
const MODULES_SECTION = 'modules';

function now() {
  return new Date().toISOString();
}

function createId(prefix = 'star') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanString(value, fallback = '', maxLength = 1000) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanPositiveInt(value, fallback = 3) {
  const number = Number(value);
  return Math.max(1, Math.floor(Number.isFinite(number) ? number : fallback));
}

function asArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
}

function cleanDiscordIdArray(value) {
  return asArray(value).map(cleanDiscordId).filter(Boolean);
}

function defaultStarboardSection() {
  return {
    enabled: true,
    channelId: null,
    starboardChannelId: null,
    logChannelId: null,
    managerRoleIds: [],
    threshold: 3,
    emoji: '⭐',
    allowBotMessages: false,
    allowSelfStar: false,
    requireUniqueUsers: true,
    posts: {},
    analytics: {
      posted: 0,
      updated: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizePost(post = {}) {
  const messageId = cleanDiscordId(post.messageId || post.id);

  return {
    id: messageId || createId('star_post'),
    messageId,
    channelId: cleanDiscordId(post.channelId),
    authorId: cleanDiscordId(post.authorId),
    starboardMessageId: cleanDiscordId(post.starboardMessageId),
    starUserIds: asArray(post.starUserIds).map(cleanDiscordId).filter(Boolean),
    createdAt: post.createdAt || now(),
    updatedAt: post.updatedAt || post.createdAt || now(),
  };
}

function normalizeSection(section = {}) {
  const base = defaultStarboardSection();
  const source = section && typeof section === 'object' ? section : {};
  const posts = source.posts && typeof source.posts === 'object' ? source.posts : {};
  const channelId = cleanDiscordId(source.channelId || source.starboardChannelId);

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    channelId,
    starboardChannelId: channelId,
    logChannelId: cleanDiscordId(source.logChannelId),
    managerRoleIds: cleanDiscordIdArray(source.managerRoleIds),
    threshold: cleanPositiveInt(source.threshold, 3),
    emoji: cleanString(source.emoji || '⭐', '⭐', 40),
    allowBotMessages: source.allowBotMessages === true,
    allowSelfStar: source.allowSelfStar === true,
    requireUniqueUsers: source.requireUniqueUsers !== false,
    posts: Object.fromEntries(
      Object.entries(posts)
        .map(([id, post]) => {
          const normalized = normalizePost({ ...post, messageId: post.messageId || id });
          return [normalized.messageId || normalized.id, normalized];
        })
        .filter(([, post]) => post.messageId && post.channelId)
    ),
    analytics: {
      posted: Math.max(0, Number(source.analytics?.posted || 0)),
      updated: Math.max(0, Number(source.analytics?.updated || 0)),
    },
    updatedAt: source.updatedAt || now(),
  };
}

function getModules(guildId) {
  const modules = getGuildSection(guildId, MODULES_SECTION, {});
  return modules && typeof modules === 'object' ? modules : {};
}

function getStarboardSection(guildId) {
  const modules = getModules(guildId);
  return normalizeSection(modules[SECTION] || defaultStarboardSection());
}

function saveStarboardSection(guildId, section, meta = {}) {
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

function updateStarboardSection(guildId, updater, meta = {}) {
  const current = getStarboardSection(guildId);
  const next = typeof updater === 'function' ? updater(current) : updater;
  return saveStarboardSection(guildId, normalizeSection(next), meta);
}

function savePost(guildId, post, meta = {}) {
  const normalized = normalizePost(post);

  return updateStarboardSection(
    guildId,
    (section) => ({
      ...section,
      posts: {
        ...(section.posts || {}),
        [normalized.messageId]: {
          ...(section.posts?.[normalized.messageId] || {}),
          ...normalized,
          updatedAt: now(),
        },
      },
      analytics: {
        ...(section.analytics || {}),
        posted: Math.max(0, Number(section.analytics?.posted || 0)) + (section.posts?.[normalized.messageId] ? 0 : 1),
        updated: Math.max(0, Number(section.analytics?.updated || 0)) + (section.posts?.[normalized.messageId] ? 1 : 0),
      },
      updatedAt: now(),
    }),
    meta
  ).posts[normalized.messageId];
}

function getPost(guildId, messageId) {
  return getStarboardSection(guildId).posts?.[messageId] || null;
}

function deletePost(guildId, messageId, meta = {}) {
  return updateStarboardSection(
    guildId,
    (section) => {
      const posts = { ...(section.posts || {}) };
      delete posts[messageId];

      return {
        ...section,
        posts,
        updatedAt: now(),
      };
    },
    meta
  );
}

module.exports = {
  SECTION,
  now,
  defaultStarboardSection,
  normalizeSection,
  getStarboardSection,
  saveStarboardSection,
  updateStarboardSection,
  savePost,
  getPost,
  deletePost,
};
