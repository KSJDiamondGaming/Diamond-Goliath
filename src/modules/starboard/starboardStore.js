'use strict';

// src/modules/starboard/starboardStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  saveGuildSection,
  updateGuildSection,
} = require('../../guild/guildManager');

const SECTION = 'starboard';

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

function defaultStarboardSection() {
  return {
    enabled: true,
    channelId: null,
    threshold: 3,
    emoji: '⭐',
    allowBotMessages: false,
    allowSelfStar: false,
    posts: {},
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

  return {
    ...base,
    ...source,
    enabled: source.enabled !== false,
    channelId: cleanDiscordId(source.channelId),
    threshold: cleanPositiveInt(source.threshold, 3),
    emoji: cleanString(source.emoji || '⭐', '⭐', 40),
    allowBotMessages: source.allowBotMessages === true,
    allowSelfStar: source.allowSelfStar === true,
    posts: Object.fromEntries(
      Object.entries(posts)
        .map(([id, post]) => {
          const normalized = normalizePost({ ...post, messageId: post.messageId || id });
          return [normalized.messageId || normalized.id, normalized];
        })
        .filter(([, post]) => post.messageId && post.channelId)
    ),
    updatedAt: source.updatedAt || now(),
  };
}

function getStarboardSection(guildId) {
  return normalizeSection(
    getGuildSection(guildId, SECTION, defaultStarboardSection())
  );
}

function saveStarboardSection(guildId, section, meta = {}) {
  return normalizeSection(
    saveGuildSection(guildId, SECTION, normalizeSection(section), meta)
  );
}

function updateStarboardSection(guildId, updater, meta = {}) {
  return normalizeSection(
    updateGuildSection(
      guildId,
      SECTION,
      (current) => {
        const normalized = normalizeSection(current);
        const next = typeof updater === 'function' ? updater(normalized) : updater;
        return normalizeSection(next);
      },
      defaultStarboardSection(),
      meta
    )
  );
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
