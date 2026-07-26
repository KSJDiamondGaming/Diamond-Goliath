'use strict';

const crypto = require('crypto');
const { getGuildSection, updateGuildSection } = require('../../../core/guild/guildManager');

const SECTION = 'starboard';
const MODULES_SECTION = 'modules';
const now = () => new Date().toISOString();
const createId = (prefix = 'star') => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@&#!>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function asArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
}

function defaultStarboardSection() {
  return {
    channelId: null,
    logChannelId: null,
    managerRoleIds: [],
    threshold: 3,
    emoji: '⭐',
    allowBotMessages: false,
    allowSelfStar: false,
    requireUniqueUsers: true,
    posts: {},
    analytics: { posted: 0, updated: 0, removed: 0 },
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
  const source = section && typeof section === 'object' ? section : {};
  const posts = source.posts && typeof source.posts === 'object' ? source.posts : {};
  return {
    ...defaultStarboardSection(),
    channelId: cleanDiscordId(source.channelId),
    logChannelId: cleanDiscordId(source.logChannelId),
    managerRoleIds: asArray(source.managerRoleIds).map(cleanDiscordId).filter(Boolean),
    threshold: Math.max(1, Math.floor(Number(source.threshold) || 3)),
    emoji: String(source.emoji || '⭐').trim().slice(0, 40) || '⭐',
    allowBotMessages: source.allowBotMessages === true,
    allowSelfStar: source.allowSelfStar === true,
    requireUniqueUsers: source.requireUniqueUsers !== false,
    posts: Object.fromEntries(Object.entries(posts).map(([id, post]) => {
      const normalized = normalizePost({ ...post, messageId: post.messageId || id });
      return [normalized.messageId || normalized.id, normalized];
    }).filter(([, post]) => post.messageId && post.channelId)),
    analytics: {
      posted: Math.max(0, Number(source.analytics?.posted || 0)),
      updated: Math.max(0, Number(source.analytics?.updated || 0)),
      removed: Math.max(0, Number(source.analytics?.removed || 0)),
    },
    createdAt: source.createdAt || now(),
    updatedAt: source.updatedAt || now(),
  };
}

function getStarboardSection(guildId) {
  const modules = getGuildSection(guildId, MODULES_SECTION, {});
  return normalizeSection(modules?.[SECTION] || {});
}

function saveStarboardSection(guildId, section, meta = {}) {
  const normalized = normalizeSection(section);
  updateGuildSection(guildId, MODULES_SECTION, (modules = {}) => ({ ...modules, [SECTION]: normalized }), {}, meta);
  return normalized;
}

function updateStarboardSection(guildId, updater, meta = {}) {
  const current = getStarboardSection(guildId);
  return saveStarboardSection(guildId, typeof updater === 'function' ? updater(current) : updater, meta);
}

function savePost(guildId, post, meta = {}) {
  const normalized = normalizePost(post);
  return updateStarboardSection(guildId, (section) => {
    const exists = Boolean(section.posts?.[normalized.messageId]);
    return {
      ...section,
      posts: { ...section.posts, [normalized.messageId]: { ...section.posts?.[normalized.messageId], ...normalized, updatedAt: now() } },
      analytics: {
        ...section.analytics,
        posted: section.analytics.posted + (exists ? 0 : 1),
        updated: section.analytics.updated + (exists ? 1 : 0),
      },
      updatedAt: now(),
    };
  }, meta).posts[normalized.messageId];
}

const getPost = (guildId, messageId) => getStarboardSection(guildId).posts?.[messageId] || null;

function deletePost(guildId, messageId, meta = {}) {
  return updateStarboardSection(guildId, (section) => {
    const posts = { ...section.posts };
    const existed = Boolean(posts[messageId]);
    delete posts[messageId];
    return {
      ...section,
      posts,
      analytics: { ...section.analytics, removed: section.analytics.removed + (existed ? 1 : 0) },
      updatedAt: now(),
    };
  }, meta);
}

module.exports = { SECTION, now, defaultStarboardSection, normalizeSection, getStarboardSection, saveStarboardSection, updateStarboardSection, savePost, getPost, deletePost };
