'use strict';

// src/modules/social/socialStore.js

const crypto = require('crypto');
const {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
} = require('../../guild/moduleSectionManager');

const MODULE = 'social';

const PLATFORMS = Object.freeze({
  TWITCH: 'twitch',
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  KICK: 'kick',
  INSTAGRAM: 'instagram',
  X: 'x',
});

const ALERT_TYPES = Object.freeze({
  LIVE: 'live',
  UPLOAD: 'upload',
  SHORT: 'short',
  POST: 'post',
});

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, fallback = '', maxLength = 500) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanKey(value, fallback = 'social') {
  return (
    String(value || fallback)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  ).slice(0, 80);
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<@#!&>]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function createId(prefix = 'social') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizePlatform(value) {
  const platform = cleanKey(value, PLATFORMS.TWITCH);
  return Object.values(PLATFORMS).includes(platform) ? platform : PLATFORMS.TWITCH;
}

function normalizeAlertTypes(value) {
  const list = Array.isArray(value) ? value : [ALERT_TYPES.LIVE];
  const cleaned = list
    .map((item) => cleanKey(item))
    .filter((item) => Object.values(ALERT_TYPES).includes(item));

  return cleaned.length ? [...new Set(cleaned)] : [ALERT_TYPES.LIVE];
}

function defaultTemplates() {
  return {
    live: {
      title: '{creator} is now live',
      description: '{title}',
      buttonLabel: 'Watch now',
    },
    upload: {
      title: '{creator} uploaded a new video',
      description: '{title}',
      buttonLabel: 'Watch now',
    },
    short: {
      title: '{creator} posted a new short',
      description: '{title}',
      buttonLabel: 'Watch now',
    },
    post: {
      title: '{creator} posted an update',
      description: '{title}',
      buttonLabel: 'View post',
    },
  };
}

function defaultSocialSection() {
  return {
    enabled: true,
    settings: {
      checkIntervalMs: 300000,
      suppressDuplicates: true,
      defaultMentionMode: 'role',
    },
    accounts: {},
    templates: defaultTemplates(),
    analytics: {
      accounts: 0,
      alertsSent: 0,
      liveAlerts: 0,
      uploadAlerts: 0,
      errors: 0,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeAccount(account = {}) {
  const source = isPlainObject(account) ? account : {};
  const platform = normalizePlatform(source.platform);
  const username = cleanString(source.username || source.handle || source.channelId || '', '', 120);
  const accountId = cleanKey(source.accountId || source.id || `${platform}-${username || createId('account')}`);

  return {
    accountId,
    id: accountId,
    enabled: source.enabled !== false,
    platform,
    displayName: cleanString(source.displayName || username || platform, platform, 120),
    username,
    externalId: cleanString(source.externalId || source.channelId || '', '', 160),
    alertChannelId: cleanDiscordId(source.alertChannelId),
    mentionRoleId: cleanDiscordId(source.mentionRoleId),
    mentionMode: ['none', 'role', 'everyone', 'here'].includes(source.mentionMode) ? source.mentionMode : 'role',
    alertTypes: normalizeAlertTypes(source.alertTypes),
    templateKey: cleanKey(source.templateKey || 'default', 'default'),
    lastSeen: isPlainObject(source.lastSeen) ? clone(source.lastSeen) : {},
    metadata: isPlainObject(source.metadata) ? clone(source.metadata) : {},
    createdAt: source.createdAt || now(),
    createdBy: cleanDiscordId(source.createdBy),
    updatedAt: source.updatedAt || source.createdAt || now(),
    updatedBy: cleanDiscordId(source.updatedBy),
  };
}

function normalizeSocialSection(section = {}) {
  const base = defaultSocialSection();
  const source = isPlainObject(section) ? section : {};
  const accounts = Object.fromEntries(
    Object.entries(isPlainObject(source.accounts) ? source.accounts : {})
      .map(([id, account]) => {
        const normalized = normalizeAccount({ ...account, accountId: account.accountId || id });
        return [normalized.accountId, normalized];
      })
  );

  return {
    ...base,
    ...clone(source),
    enabled: source.enabled !== false,
    settings: {
      ...base.settings,
      ...(isPlainObject(source.settings) ? clone(source.settings) : {}),
    },
    accounts,
    templates: {
      ...base.templates,
      ...(isPlainObject(source.templates) ? clone(source.templates) : {}),
    },
    analytics: {
      accounts: Object.keys(accounts).length,
      alertsSent: Math.max(0, Number(source.analytics?.alertsSent || 0)),
      liveAlerts: Math.max(0, Number(source.analytics?.liveAlerts || 0)),
      uploadAlerts: Math.max(0, Number(source.analytics?.uploadAlerts || 0)),
      errors: Math.max(0, Number(source.analytics?.errors || 0)),
    },
    createdAt: source.createdAt || base.createdAt,
    updatedAt: source.updatedAt || now(),
  };
}

function getSocialSection(guildId) {
  return normalizeSocialSection(getModuleSection(guildId, MODULE, defaultSocialSection()));
}

function saveSocialSection(guildId, section, guildOrMeta = {}) {
  return normalizeSocialSection(saveModuleSection(guildId, MODULE, normalizeSocialSection(section), guildOrMeta));
}

function updateSocialSection(guildId, updater, guildOrMeta = {}) {
  return normalizeSocialSection(updateModuleSection(
    guildId,
    MODULE,
    (current) => {
      const normalized = normalizeSocialSection(current);
      const next = typeof updater === 'function' ? updater(clone(normalized)) : updater;
      return normalizeSocialSection(next);
    },
    defaultSocialSection(),
    guildOrMeta
  ));
}

function saveAccount(guildId, account, guildOrMeta = {}) {
  const normalized = normalizeAccount(account);
  return updateSocialSection(guildId, (section) => ({
    ...section,
    accounts: {
      ...section.accounts,
      [normalized.accountId]: {
        ...(section.accounts[normalized.accountId] || {}),
        ...normalized,
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  }), guildOrMeta).accounts[normalized.accountId];
}

function removeAccount(guildId, accountId, guildOrMeta = {}) {
  const safeId = cleanKey(accountId, 'account');
  return updateSocialSection(guildId, (section) => {
    const accounts = { ...section.accounts };
    delete accounts[safeId];
    return { ...section, accounts, updatedAt: now() };
  }, guildOrMeta);
}

function listAccounts(guildId) {
  return Object.values(getSocialSection(guildId).accounts || {});
}

function incrementAnalytics(guildId, increments = {}, guildOrMeta = {}) {
  return updateSocialSection(guildId, (section) => {
    const analytics = { ...section.analytics };
    for (const [key, amount] of Object.entries(increments || {})) {
      const value = Number(amount || 0);
      if (!Number.isFinite(value)) continue;
      analytics[key] = Math.max(0, Number(analytics[key] || 0) + value);
    }
    return { ...section, analytics, updatedAt: now() };
  }, guildOrMeta).analytics;
}

module.exports = {
  MODULE,
  PLATFORMS,
  ALERT_TYPES,
  createId,
  cleanKey,
  defaultSocialSection,
  normalizeAccount,
  normalizeSocialSection,
  getSocialSection,
  saveSocialSection,
  updateSocialSection,
  saveAccount,
  removeAccount,
  listAccounts,
  incrementAnalytics,
};
