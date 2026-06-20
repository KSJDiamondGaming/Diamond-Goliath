'use strict';

// src/modules/social/socialManager.js

const { EmbedBuilder } = require('discord.js');
const socialStore = require('./socialStore');

const PLATFORM_COLORS = {
  instagram: 0xe1306c,
  kick: 0x53fc18,
  tiktok: 0x010101,
  twitch: 0x9146ff,
  x: 0x111827,
  youtube: 0xff0000,
};

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

function formatPlatform(platform = 'social') {
  const labels = {
    instagram: 'Instagram',
    kick: 'Kick',
    tiktok: 'TikTok',
    twitch: 'Twitch',
    x: 'X',
    youtube: 'YouTube',
  };

  return labels[platform] || String(platform).toUpperCase();
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

function buildMention(account = {}) {
  if (account.mentionMode === 'everyone') return '@everyone';
  if (account.mentionMode === 'here') return '@here';
  if (account.mentionRoleId) return `<@&${account.mentionRoleId}>`;
  return '';
}

function buildTestEmbed(account = {}, alert = {}) {
  const platform = account.platform || alert.platform || 'social';
  const creator = account.displayName || account.username || 'Creator';
  const alertTypes = Array.isArray(account.alertTypes) && account.alertTypes.length
    ? account.alertTypes.join(', ')
    : 'test';

  return new EmbedBuilder()
    .setColor(PLATFORM_COLORS[platform] || 0x5865f2)
    .setTitle(`🧪 ${alert.title || `${creator} test alert`}`)
    .setDescription(alert.description || 'This is a test notification from Goliath Social Alerts.')
    .addFields(
      { name: 'Creator', value: creator, inline: true },
      { name: 'Platform', value: formatPlatform(platform), inline: true },
      { name: 'Alert Types', value: alertTypes, inline: true },
      { name: 'Username / Channel ID', value: account.username || 'Not set', inline: false }
    )
    .setFooter({ text: 'Goliath Social Alerts • Test Notification' })
    .setTimestamp(new Date());
}

async function sendTestAlert(guildId, accountId, client, meta = {}) {
  const config = getConfig(guildId);
  const account = config.accounts.find((item) => item.accountId === accountId || item.id === accountId);

  if (!account) {
    return { success: false, status: 404, error: 'Social account not found.' };
  }

  if (account.enabled === false) {
    return { success: false, status: 400, error: 'Enable this social account before sending a test alert.' };
  }

  if (!account.alertChannelId) {
    return { success: false, status: 400, error: 'Choose an alert channel before sending a test alert.' };
  }

  const discordClient = client || global.client || global.discordClient;
  if (!discordClient?.channels?.fetch) {
    return { success: false, status: 500, error: 'Discord client is unavailable.' };
  }

  const channel = await discordClient.channels.fetch(account.alertChannelId).catch(() => null);
  if (!channel?.send) {
    return { success: false, status: 404, error: 'Could not find a sendable alert channel.' };
  }

  const alert = buildTestAlert(account);
  const mention = buildMention(account);
  const message = await channel.send({
    content: mention || undefined,
    embeds: [buildTestEmbed(account, alert)],
    allowedMentions: {
      parse: mention === '@everyone' ? ['everyone'] : mention === '@here' ? ['everyone'] : [],
      roles: account.mentionRoleId ? [account.mentionRoleId] : [],
    },
  });

  updateAccount(guildId, account.accountId, {
    lastSeen: {
      ...(account.lastSeen || {}),
      lastAlertAt: new Date().toISOString(),
      lastTestMessageId: message.id,
      lastTestChannelId: channel.id,
    },
  }, { action: 'social_test_alert_sent', ...meta });

  socialStore.incrementAnalytics(guildId, { alertsSent: 1 }, { action: 'social_test_alert_analytics', ...meta });

  return {
    success: true,
    alert,
    channelId: channel.id,
    messageId: message.id,
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
  sendTestAlert,
};
