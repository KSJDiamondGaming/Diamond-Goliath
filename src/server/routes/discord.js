const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

const GUILD_CACHE_TTL_MS = 15 * 1000;
const CHANNEL_CACHE_TTL_MS = 30 * 1000;

const MANAGE_GUILD_PERMISSION = BigInt(0x20);

const guildCache = new Map();
const channelCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBotToken() {
  return String(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN || '').trim();
}

function requireBotToken() {
  const token = getBotToken();

  if (!token) {
    throw new Error('Missing bot token. Set TOKEN in root .env or dashboard/.env');
  }

  return token;
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
    return (BigInt(guild?.permissions || 0) & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;
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

async function fetchBotGuilds() {
  const botToken = requireBotToken();

  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

async function fetchGuildChannels(guildId) {
  const botToken = requireBotToken();

  return fetchJson(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

router.get('/guilds', async (req, res) => {
  try {
    const accessToken = getSessionAccessToken(req);

    if (!req.session?.user || !accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const cacheKey = `guilds:${req.session.user.id}`;
    const cachedGuilds = getCache(guildCache, cacheKey);

    if (cachedGuilds) {
      return res.json(cachedGuilds);
    }

    const [userGuilds, botGuilds] = await Promise.all([
      fetchUserGuilds(accessToken),
      fetchBotGuilds(),
    ]);

    const botGuildIds = new Set(botGuilds.map((guild) => guild.id));

    const mutualGuilds = userGuilds
      .filter((guild) => botGuildIds.has(guild.id))
      .filter(hasManageGuildPermission)
      .map((guild) => {
        const iconUrl = buildGuildIconUrl(guild);

        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon || null,
          iconUrl,
          iconURL: iconUrl,
          owner: Boolean(guild.owner),
          permissions: guild.permissions,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    setCache(guildCache, cacheKey, mutualGuilds, GUILD_CACHE_TTL_MS);

    return res.json(mutualGuilds);
  } catch (error) {
    console.error('❌ Failed to fetch guilds:', error);

    if (String(error.message || '').toLowerCase().includes('rate limit')) {
      return res.status(429).json({
        error: 'Discord rate limiting. Try again shortly.',
      });
    }

    return res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!req.session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const cacheKey = `channels:${guildId}`;
    const cachedChannels = getCache(channelCache, cacheKey);

    if (cachedChannels) {
      return res.json(cachedChannels);
    }

    const channels = await fetchGuildChannels(guildId);

    const textChannels = channels
      .filter((channel) => channel && (channel.type === 0 || channel.type === 5))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position ?? 0,
      }))
      .sort((a, b) => {
        const diff = a.position - b.position;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });

    setCache(channelCache, cacheKey, textChannels, CHANNEL_CACHE_TTL_MS);

    return res.json(textChannels);
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
});

module.exports = router;