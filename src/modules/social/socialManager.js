'use strict';

// src/modules/social/socialManager.js

const socialStore = require('./socialStore');

function getOverview(guildId) {
  const section = socialStore.getSocialSection(guildId);
  const accounts = Object.values(section.accounts || {});
  const enabledAccounts = accounts.filter((account) => account.enabled !== false);
  const platformCounts = accounts.reduce((counts, account) => {
    counts[account.platform] = (counts[account.platform] || 0) + 1;
    return counts;
  }, {});

  return {
    enabled: section.enabled !== false,
    accountCount: accounts.length,
    enabledAccountCount: enabledAccounts.length,
    platformCounts,
    analytics: section.analytics || {},
    settings: section.settings || {},
  };
}

function getConfig(guildId) {
  const section = socialStore.getSocialSection(guildId);
  return {
    ...section,
    accounts: Object.values(section.accounts || {}),
  };
}

function setEnabled(guildId, enabled, meta = {}) {
  return socialStore.updateSocialSection(guildId, (section) => ({
    ...section,
    enabled: enabled === true,
    updatedAt: new Date().toISOString(),
  }), meta);
}

function addAccount(guildId, account, meta = {}) {
  return socialStore.saveAccount(guildId, account, meta);
}

function removeAccount(guildId, accountId, meta = {}) {
  return socialStore.removeAccount(guildId, accountId, meta);
}

function updateAccount(guildId, accountId, updates = {}, meta = {}) {
  const existing = socialStore.getSocialSection(guildId).accounts[socialStore.cleanKey(accountId, 'account')];
  if (!existing) return null;
  return socialStore.saveAccount(guildId, { ...existing, ...updates, accountId: existing.accountId }, meta);
}

function buildTestAlert(account = {}) {
  const platform = account.platform || 'social';
  const creator = account.displayName || account.username || 'Creator';
  const livePlatforms = ['twitch', 'kick', 'tiktok'];
  const isLive = livePlatforms.includes(platform);

  return {
    platform,
    title: isLive ? `${creator} is now live` : `${creator} posted a new update`,
    description: isLive
      ? 'This is a test live notification from Goliath Social Alerts.'
      : 'This is a test content notification from Goliath Social Alerts.',
    url: account.metadata?.url || '',
    accountId: account.accountId,
    createdAt: new Date().toISOString(),
  };
}

module.exports = {
  getOverview,
  getConfig,
  setEnabled,
  addAccount,
  removeAccount,
  updateAccount,
  buildTestAlert,
};
