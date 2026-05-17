const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

const GUILD_CACHE_TTL_MS = 15 * 1000;
const CHANNEL_CACHE_TTL_MS = 30 * 1000;

const ADMINISTRATOR_PERMISSION = BigInt(0x8);
const MANAGE_GUILD_PERMISSION = BigInt(0x20);

const guildCache = new Map();
const channelCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBotToken() {
  return String(
    process.env.DISCORD_TOKEN ||
      process.env.TOKEN ||
      process.env.DISCORD_BOT_TOKEN ||
      process.env.BOT_TOKEN ||
      ''
  ).trim();
}

function requireBotToken() {
  const token = getBotToken();

  if (!token) {
    throw new Error(
      'Missing bot token. Expected DISCORD_TOKEN, TOKEN, DISCORD_BOT_TOKEN, or BOT_TOKEN.'
    );
  }

  return token;
}

function getClient(req) {
  return req.app.get('client') || req.app.get('discordClient') || null;
}

function getDashboardOwnerIds() {
  return [
    process.env.DASHBOARD_OWNER_IDS,
    process.env.BOT_OWNER_ID,
    process.env.OWNER_ID,
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
}

function getMainGuildId() {
  return String(
    process.env.MAIN_GUILD_ID ||
      process.env.DEV_GUILD_ID ||
      process.env.GUILD_ID ||
      ''
  ).trim();
}

function getCache(cache, cacheKey) {
  const cached = cache.get(cacheKey);

  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCache(cache, cacheKey, data, ttlMs) {
  cache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

function hasManageGuildPermission(guild) {
  if (guild?.owner) return true;

  try {
    const permissions = BigInt(guild?.permissions || 0);

    const hasAdministrator =
      (permissions & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;

    const hasManageGuild =
      (permissions & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;

    return hasAdministrator || hasManageGuild;
  } catch {
    return false;
  }
}

function buildGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) return null;

  const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=256`;
}

function getSessionAccessToken(req) {
  return (
    req.session?.accessToken ||
    req.session?.discordAccessToken ||
    req.session?.access_token ||
    req.session?.token ||
    ''
  );
}

async function fetchJson(url, options = {}, retryCount = 0) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    let retryAfterMs = 1000;

    try {
      const data = await response.json();
      const retryAfter = Number(data?.retry_after);

      if (!Number.isNaN(retryAfter) && retryAfter > 0) {
        retryAfterMs = Math.ceil(retryAfter * 1000);
      }
    } catch {
      const headerValue = Number(response.headers.get('retry-after'));

      if (!Number.isNaN(headerValue) && headerValue > 0) {
        retryAfterMs = Math.ceil(headerValue * 1000);
      }
    }

    if (retryCount < 3) {
      await sleep(retryAfterMs + 150);
      return fetchJson(url, options, retryCount + 1);
    }

    throw new Error(`Rate limited after retries (${retryAfterMs}ms)`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status}: ${text}`);
  }

  return response.json();
}

async function fetchUserGuilds(accessToken) {
  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function fetchBotGuildsFromToken() {
  const botToken = requireBotToken();

  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

async function fetchGuildChannelsFromToken(guildId) {
  const botToken = requireBotToken();

  return fetchJson(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

function normalizeApiGuild(guild) {
  const iconUrl = buildGuildIconUrl(guild);

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    owner: Boolean(guild.owner),
    permissions: guild.permissions,
    source: guild.source || 'api',
  };
}

function normalizeClientGuild(guild) {
  const iconUrl = guild.iconURL?.({ size: 256 }) || null;

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    memberCount: guild.memberCount || 0,
    members: guild.memberCount || 0,
    ownerId: guild.ownerId || null,
    available: guild.available !== false,
    source: 'client',
  };
}

function getClientGuilds(client) {
  if (!client?.guilds?.cache) return [];

  return [...client.guilds.cache.values()]
    .map(normalizeClientGuild)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getClientGuildChannels(client, guildId) {
  const guild = client?.guilds?.cache?.get(String(guildId));

  if (!guild?.channels?.cache) return null;

  return [...guild.channels.cache.values()]
    .filter((channel) => channel && (channel.type === 0 || channel.type === 5))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      position: channel.position ?? 0,
      parentId: channel.parentId || null,
    }))
    .sort((a, b) => {
      const diff = a.position - b.position;

      if (diff !== 0) return diff;

      return a.name.localeCompare(b.name);
    });
}

function normalizeFallbackGuild(guild) {
  if (!guild) return null;

  if (guild.source === 'client') {
    return guild;
  }

  return normalizeApiGuild(guild);
}

function buildGuildDebugPayload(guild, botGuildIds) {
  let permissionValue = '0';
  let hasAdministrator = false;
  let hasManageGuild = false;

  try {
    const permissions = BigInt(guild.permissions || 0);

    permissionValue = permissions.toString();
    hasAdministrator =
      (permissions & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
    hasManageGuild =
      (permissions & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;
  } catch {
    // Keep defaults.
  }

  const botIsInGuild = botGuildIds.has(guild.id);

  return {
    id: guild.id,
    name: guild.name,
    owner: Boolean(guild.owner),
    permissions: permissionValue,
    hasAdministrator,
    hasManageGuild,
    botIsInGuild,
    wouldShow:
      botIsInGuild &&
      (Boolean(guild.owner) || hasAdministrator || hasManageGuild),
  };
}

router.get('/guilds', async (req, res) => {
  try {
    const accessToken = getSessionAccessToken(req);
    const client = getClient(req);

    if (!req.session?.user || !accessToken) {
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    const cacheKey = `guilds:${req.session.user.id}`;
    const cachedGuilds = getCache(guildCache, cacheKey);

    if (cachedGuilds) {
      return res.json(cachedGuilds);
    }

    const clientGuilds = getClientGuilds(client);

    let userGuilds = [];
    let botGuilds = [];

    try {
      userGuilds = await fetchUserGuilds(accessToken);
    } catch (error) {
      console.warn('Could not fetch OAuth user guilds:', error.message);
    }

    try {
      botGuilds =
        clientGuilds.length > 0 ? clientGuilds : await fetchBotGuildsFromToken();
    } catch (error) {
      console.warn('Could not fetch bot guilds from token:', error.message);
    }

    const botGuildIds = new Set(
      Array.isArray(botGuilds) ? botGuilds.map((guild) => guild.id) : []
    );

    const mutualGuilds = Array.isArray(userGuilds)
      ? userGuilds
          .filter((guild) => botGuildIds.has(guild.id))
          .filter(hasManageGuildPermission)
          .map(normalizeApiGuild)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    const dashboardOwnerIds = getDashboardOwnerIds();
    const mainGuildId = getMainGuildId();
    const isDashboardOwner = dashboardOwnerIds.includes(String(req.session.user.id));

    let finalGuilds = mutualGuilds;

    /**
     * Owner/dev fallback:
     *
     * Your OAuth permissions currently say the dashboard user does not have
     * Manage Guild/Admin on KSJ DIAMOND GAMING, even though the bot is in it.
     *
     * Instead of changing .env again, this checks your existing:
     *   BOT_OWNER_ID
     *   OWNER_ID
     *   DEV_GUILD_ID
     *
     * If the logged-in dashboard user is one of the owner IDs, they can see
     * the configured dev/main guild.
     */
    if (finalGuilds.length === 0 && isDashboardOwner) {
      const fallbackGuilds = clientGuilds.length > 0 ? clientGuilds : botGuilds;

      finalGuilds = Array.isArray(fallbackGuilds)
        ? fallbackGuilds
            .map(normalizeFallbackGuild)
            .filter(Boolean)
            .filter((guild) => {
              if (!mainGuildId) return true;
              return String(guild.id) === mainGuildId;
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
    }

    setCache(guildCache, cacheKey, finalGuilds, GUILD_CACHE_TTL_MS);

    return res.json(finalGuilds);
  } catch (error) {
    console.error('❌ Failed to fetch guilds:', error);

    if (String(error.message || '').toLowerCase().includes('rate limit')) {
      return res.status(429).json({
        error: 'Discord rate limiting. Try again shortly.',
        detail: error.message || 'Rate limited',
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch guilds',
      detail: error.message || 'Unknown error',
    });
  }
});

router.get('/debug-guilds', async (req, res) => {
  try {
    const accessToken = getSessionAccessToken(req);
    const client = getClient(req);
    const clientGuilds = getClientGuilds(client);

    if (!req.session?.user || !accessToken) {
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    let userGuilds = [];
    let botGuilds = [];

    try {
      userGuilds = await fetchUserGuilds(accessToken);
    } catch (error) {
      userGuilds = {
        error: error.message,
      };
    }

    try {
      botGuilds =
        clientGuilds.length > 0 ? clientGuilds : await fetchBotGuildsFromToken();
    } catch (error) {
      botGuilds = {
        error: error.message,
      };
    }

    const botGuildIds = new Set(
      Array.isArray(botGuilds) ? botGuilds.map((guild) => guild.id) : []
    );

    const dashboardOwnerIds = getDashboardOwnerIds();
    const mainGuildId = getMainGuildId();
    const isDashboardOwner = dashboardOwnerIds.includes(String(req.session.user.id));

    return res.json({
      authenticatedUser: req.session.user,

      ownerAccess: {
        dashboardOwnerIds,
        mainGuildId,
        isDashboardOwner,
      },

      clientReady: Boolean(client?.isReady?.()),
      clientGuildCount: clientGuilds.length,
      clientGuilds: clientGuilds.map((guild) => ({
        id: guild.id,
        name: guild.name,
      })),

      userGuildCount: Array.isArray(userGuilds) ? userGuilds.length : 0,
      botGuildCount: Array.isArray(botGuilds) ? botGuilds.length : 0,

      userGuilds: Array.isArray(userGuilds)
        ? userGuilds.map((guild) => buildGuildDebugPayload(guild, botGuildIds))
        : userGuilds,

      botGuilds: Array.isArray(botGuilds)
        ? botGuilds.map((guild) => ({
            id: guild.id,
            name: guild.name,
          }))
        : botGuilds,
    });
  } catch (error) {
    console.error('❌ Debug guilds failed:', error);

    return res.status(500).json({
      error: 'Debug guilds failed',
      detail: error.message || 'Unknown error',
    });
  }
});

router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;
    const client = getClient(req);

    if (!req.session?.user) {
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    const cacheKey = `channels:${guildId}`;
    const cachedChannels = getCache(channelCache, cacheKey);

    if (cachedChannels) {
      return res.json(cachedChannels);
    }

    const clientChannels = getClientGuildChannels(client, guildId);

    let textChannels = [];

    if (Array.isArray(clientChannels)) {
      textChannels = clientChannels;
    } else {
      const channels = await fetchGuildChannelsFromToken(guildId);

      textChannels = Array.isArray(channels)
        ? channels
            .filter((channel) => channel && (channel.type === 0 || channel.type === 5))
            .map((channel) => ({
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: channel.position ?? 0,
              parentId: channel.parent_id || null,
            }))
            .sort((a, b) => {
              const diff = a.position - b.position;

              if (diff !== 0) return diff;

              return a.name.localeCompare(b.name);
            })
        : [];
    }

    setCache(channelCache, cacheKey, textChannels, CHANNEL_CACHE_TTL_MS);

    return res.json(textChannels);
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);

    return res.status(500).json({
      error: 'Failed to fetch guild channels',
      detail: error.message || 'Unknown error',
    });
  }
});

module.exports = router;