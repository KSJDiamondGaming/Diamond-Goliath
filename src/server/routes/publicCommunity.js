const express = require('express');

const router = express.Router();

const CACHE_TTL_MS = Math.max(15_000, Number(process.env.PUBLIC_COMMUNITY_CACHE_TTL_MS || 60_000));
const ANNOUNCEMENT_LIMIT = Math.min(10, Math.max(1, Number(process.env.PUBLIC_COMMUNITY_ANNOUNCEMENT_LIMIT || 3)));
const EVENT_LIMIT = Math.min(10, Math.max(1, Number(process.env.PUBLIC_COMMUNITY_EVENT_LIMIT || 4)));

let cache = {
  expiresAt: 0,
  payload: null,
};

function getGuildId() {
  return String(
    process.env.TWOTONETAJ_GUILD_ID
      || process.env.TAJSQUAD_GUILD_ID
      || process.env.PUBLIC_COMMUNITY_GUILD_ID
      || '',
  ).trim();
}

function getAnnouncementChannelId() {
  return String(
    process.env.TWOTONETAJ_ANNOUNCEMENT_CHANNEL_ID
      || process.env.TAJSQUAD_ANNOUNCEMENT_CHANNEL_ID
      || '',
  ).trim();
}

function getInviteUrl() {
  return String(process.env.TWOTONETAJ_DISCORD_INVITE || 'https://discord.gg/WcbtQPuByd').trim();
}

function getAssetUrl(asset) {
  return asset || null;
}

function sanitizeText(value, maxLength = 400) {
  return String(value || '')
    .replace(/<@!?\d+>/g, '@member')
    .replace(/<@&\d+>/g, '@role')
    .replace(/<#\d+>/g, '#channel')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function mapEvent(event) {
  return {
    id: event.id,
    name: sanitizeText(event.name, 120),
    description: sanitizeText(event.description, 280),
    scheduledStartAt: event.scheduledStartAt?.toISOString?.() || null,
    scheduledEndAt: event.scheduledEndAt?.toISOString?.() || null,
    status: event.status || null,
    entityType: event.entityType || null,
    userCount: Number(event.userCount || 0),
    imageUrl: getAssetUrl(event.coverImageURL?.({ size: 1024 }) || null),
  };
}

function mapAnnouncement(message) {
  return {
    id: message.id,
    title: sanitizeText(message.embeds?.[0]?.title || 'Community Update', 120),
    content: sanitizeText(message.content || message.embeds?.[0]?.description || '', 420),
    createdAt: message.createdAt?.toISOString?.() || null,
    author: sanitizeText(message.author?.displayName || message.author?.username || 'TajSquad', 80),
    url: message.url || null,
  };
}

async function fetchAnnouncements(guild) {
  const channelId = getAnnouncementChannelId();
  if (!channelId) return [];

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || typeof channel.messages?.fetch !== 'function') return [];

  const messages = await channel.messages.fetch({ limit: ANNOUNCEMENT_LIMIT }).catch(() => null);
  if (!messages) return [];

  return [...messages.values()]
    .filter((message) => !message.system)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
    .slice(0, ANNOUNCEMENT_LIMIT)
    .map(mapAnnouncement);
}

async function fetchEvents(guild) {
  const events = await guild.scheduledEvents.fetch({ withUserCount: true }).catch(() => null);
  if (!events) return [];

  return [...events.values()]
    .sort((a, b) => (a.scheduledStartTimestamp || 0) - (b.scheduledStartTimestamp || 0))
    .slice(0, EVENT_LIMIT)
    .map(mapEvent);
}

async function buildCommunityPayload(client) {
  const guildId = getGuildId();
  if (!guildId) {
    const error = new Error('TwoToneTaj community guild is not configured');
    error.statusCode = 503;
    throw error;
  }

  if (!client?.isReady?.()) {
    const error = new Error('Discord client is not ready');
    error.statusCode = 503;
    throw error;
  }

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    const error = new Error('Configured community guild is unavailable');
    error.statusCode = 404;
    throw error;
  }

  await guild.members.fetch({ withPresences: false }).catch(() => null);

  const [events, announcements] = await Promise.all([
    fetchEvents(guild),
    fetchAnnouncements(guild),
  ]);

  const nonBotMembers = guild.members.cache.filter((member) => !member.user?.bot);
  const cachedOnlineMembers = nonBotMembers.filter((member) => {
    const status = member.presence?.status;
    return status && status !== 'offline';
  }).size;

  return {
    ok: true,
    community: {
      id: guild.id,
      name: guild.name,
      description: sanitizeText(guild.description || 'The official TwoToneTaj community.', 300),
      iconUrl: getAssetUrl(guild.iconURL({ extension: 'webp', size: 512 })),
      bannerUrl: getAssetUrl(guild.bannerURL({ extension: 'webp', size: 2048 })),
      splashUrl: getAssetUrl(guild.splashURL({ extension: 'webp', size: 2048 })),
      inviteUrl: getInviteUrl(),
      memberCount: Number(guild.memberCount || guild.members.cache.size || 0),
      humanMemberCount: nonBotMembers.size,
      onlineCount: cachedOnlineMembers || null,
      boostCount: Number(guild.premiumSubscriptionCount || 0),
      boostTier: Number(guild.premiumTier || 0),
      channelCount: guild.channels.cache.size,
      roleCount: Math.max(0, guild.roles.cache.size - 1),
      scheduledEventCount: guild.scheduledEvents.cache.size,
      botReady: true,
    },
    events,
    announcements,
    meta: {
      source: 'goliath-discord-client',
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      onlineCountNote: cachedOnlineMembers
        ? 'Based on presences currently cached by the bot.'
        : 'Exact presence data requires the Discord Server Members and Presence intents.',
    },
  };
}

router.get('/twotonetaj', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

  try {
    if (cache.payload && cache.expiresAt > Date.now()) {
      return res.json({ ...cache.payload, meta: { ...cache.payload.meta, cached: true } });
    }

    const payload = await buildCommunityPayload(req.client);
    cache = {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return res.json({ ...payload, meta: { ...payload.meta, cached: false } });
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    return res.status(statusCode).json({
      ok: false,
      error: statusCode >= 500 ? 'Community data is temporarily unavailable' : error.message,
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  }
});

module.exports = router;
