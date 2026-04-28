const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const GUILD_CACHE_TTL_MS = 15 * 1000;

const guildCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBotToken() {
  return process.env.TOKEN || process.env.DISCORD_BOT_TOKEN || '';
}

function getCachedGuilds(cacheKey) {
  const cached = guildCache.get(cacheKey);

  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    guildCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCachedGuilds(cacheKey, data) {
  guildCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + GUILD_CACHE_TTL_MS,
  });
}

async function fetchJson(url, options = {}, retryCount = 0) {
  const res = await fetch(url, options);

  if (res.status === 429) {
    let retryAfterMs = 1000;

    try {
      const data = await res.json();
      const retryAfter = Number(data?.retry_after);

      if (!Number.isNaN(retryAfter) && retryAfter > 0) {
        retryAfterMs = Math.ceil(retryAfter * 1000);
      }
    } catch {
      const headerValue = Number(res.headers.get('retry-after'));

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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }

  return res.json();
}

function buildGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`;
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

async function fetchUserGuilds(accessToken) {
  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function fetchBotGuilds() {
  const botToken = getBotToken();

  if (!botToken) {
    throw new Error('Missing bot token. Set TOKEN in root .env or dashboard/.env');
  }

  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

async function fetchGuildChannels(guildId) {
  const botToken = getBotToken();

  if (!botToken) {
    throw new Error('Missing bot token. Set TOKEN in root .env or dashboard/.env');
  }

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

    const cacheKey = `guilds:${req.session.user.id}:${accessToken}`;
    const cachedGuilds = getCachedGuilds(cacheKey);

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
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconURL: buildGuildIconUrl(guild),
        iconUrl: buildGuildIconUrl(guild),
        owner: guild.owner,
        permissions: guild.permissions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setCachedGuilds(cacheKey, mutualGuilds);

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

    return res.json(textChannels);
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
});

module.exports = router;