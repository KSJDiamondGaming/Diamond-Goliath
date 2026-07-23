'use strict';

const { EmbedBuilder } = require('discord.js');
const socialStore = require('./socialStore');
const socialHistory = require('./socialHistory');

function clientFor(client) {
  return client || global.client || global.discordClient;
}

async function fetchActiveMessage(account = {}, client) {
  const channelId = account.lastSeen?.lastChannelId;
  const messageId = account.lastSeen?.lastMessageId;
  const discordClient = clientFor(client);
  if (!channelId || !messageId || !discordClient?.channels?.fetch) return null;
  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (!channel?.messages?.fetch) return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  return message ? { channel, message } : null;
}

function liveSnapshot(result = {}) {
  return JSON.stringify({
    title: String(result.title || ''),
    gameName: String(result.gameName || ''),
    thumbnailUrl: String(result.thumbnailUrl || ''),
    viewerCount: Number(result.viewerCount || 0),
    url: String(result.url || ''),
  });
}

async function syncLiveMessage(guildId, account = {}, result = {}, client, meta = {}) {
  const settings = socialStore.getSocialSection(guildId).settings || {};
  if (settings.editLiveNotifications !== true) return { success: false, skipped: true, reason: 'live_editing_disabled' };
  if (!result.isLive || !result.contentId || account.lastSeen?.lastContentId !== result.contentId) {
    return { success: false, skipped: true, reason: 'not_active_session' };
  }

  const snapshot = liveSnapshot(result);
  if (account.lastSeen?.lastLiveMessageSnapshot === snapshot) {
    return { success: false, skipped: true, reason: 'message_unchanged' };
  }

  const active = await fetchActiveMessage(account, client);
  if (!active) return { success: false, skipped: true, reason: 'active_message_unavailable' };
  const socialManager = require('./socialManager');
  try {
    await active.message.edit({ embeds: [socialManager.buildLiveEmbed(account, result)] });
    socialManager.updateAccount(guildId, account.accountId, {
      lastSeen: {
        ...(account.lastSeen || {}),
        lastLiveMessageSnapshot: snapshot,
        lastMessageEditedAt: new Date().toISOString(),
      },
    }, { action: 'social_live_alert_edited', ...meta });
    socialHistory.record(guildId, {
      status: 'edited', eventType: 'delivery', accountId: account.accountId,
      creator: account.displayName, platform: account.platform, alertType: 'live',
      contentId: result.contentId, title: result.title || null,
      channelId: active.channel.id, messageId: active.message.id,
    }, meta);
    return { success: true, edited: true, channelId: active.channel.id, messageId: active.message.id };
  } catch (error) {
    socialHistory.record(guildId, {
      status: 'failed', eventType: 'delivery_edit', accountId: account.accountId,
      creator: account.displayName, platform: account.platform, alertType: 'live',
      contentId: result.contentId, error: error.message,
    }, meta);
    return { success: false, error: error.message };
  }
}

function endedEmbed(account = {}, endedAt = new Date()) {
  const creator = account.displayName || account.username || 'Creator';
  const startedAt = Date.parse(account.lastSeen?.lastLiveAt || '');
  const durationMs = Number.isFinite(startedAt) ? Math.max(0, endedAt.getTime() - startedAt) : 0;
  const durationMinutes = Math.floor(durationMs / 60000);
  const embed = new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle(`⚫ ${creator} is no longer live`)
    .setDescription(account.lastSeen?.lastLiveTitle || 'The live stream has ended.')
    .setFooter({ text: durationMinutes > 0 ? `Stream ended • Live for ${durationMinutes} minutes` : 'Stream ended' })
    .setTimestamp(endedAt);
  if (account.url) embed.setURL(account.url);
  return embed;
}

async function finalizeLiveMessage(guildId, account = {}, client, meta = {}) {
  const settings = socialStore.getSocialSection(guildId).settings || {};
  const active = await fetchActiveMessage(account, client);
  if (!active) return { success: false, skipped: true, reason: 'active_message_unavailable' };
  const socialManager = require('./socialManager');
  const endedAt = new Date();
  try {
    if (settings.deleteEndedNotifications === true) {
      await active.message.delete();
    } else {
      await active.message.edit({ content: undefined, embeds: [endedEmbed(account, endedAt)], components: [] });
    }
    socialManager.updateAccount(guildId, account.accountId, {
      lastSeen: {
        ...(account.lastSeen || {}),
        lastMessageFinalizedAt: endedAt.toISOString(),
        lastMessageId: settings.deleteEndedNotifications === true ? null : account.lastSeen?.lastMessageId,
      },
    }, { action: settings.deleteEndedNotifications === true ? 'social_live_alert_deleted' : 'social_live_alert_ended_edit', ...meta });
    socialHistory.record(guildId, {
      status: settings.deleteEndedNotifications === true ? 'deleted' : 'edited',
      eventType: 'stream_ended_delivery', accountId: account.accountId,
      creator: account.displayName, platform: account.platform, alertType: 'live',
      contentId: account.lastSeen?.lastContentId || null,
      channelId: active.channel.id, messageId: active.message.id,
    }, meta);
    return { success: true, deleted: settings.deleteEndedNotifications === true, edited: settings.deleteEndedNotifications !== true };
  } catch (error) {
    socialHistory.record(guildId, {
      status: 'failed', eventType: 'stream_ended_delivery', accountId: account.accountId,
      creator: account.displayName, platform: account.platform, alertType: 'live', error: error.message,
    }, meta);
    return { success: false, error: error.message };
  }
}

module.exports = { liveSnapshot, syncLiveMessage, finalizeLiveMessage };
