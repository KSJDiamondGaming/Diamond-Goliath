const fetch = global.fetch || require('node-fetch');
const express = require('express');
const router = express.Router();

const client = require('../../../index.js');

const DISCORD_API = 'https://discord.com/api/v10';
const GUILD_CACHE_TTL_MS = 15 * 1000;

const guildCache = new Map();

/* =========================
   HELPERS
   ========================= */

function isBotReady() {
  return client?.isReady && client.isReady();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCachedGuilds(accessToken) {
  const cached = guildCache.get(accessToken);

  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    guildCache.delete(accessToken);
    return null;
  }

  return cached.data;
}

function setCachedGuilds(accessToken, data) {
  guildCache.set(accessToken, {
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

async function discordRequest(url, token) {
  return fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function buildGuildIconUrl(guild) {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`;
}

/* =========================
   ROUTES
   ========================= */

router.get('/guilds', async (req, res) => {
  try {
    // ✅ STRICT session check (prevents 503 crash)
    if (!req.session?.user || !req.session?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const accessToken = req.session.accessToken;

    // ✅ Prevent hitting route before bot ready
    if (!isBotReady()) {
      return res.status(503).json({ error: 'Bot is not ready yet.' });
    }

    // ✅ Use cache
    const cachedGuilds = getCachedGuilds(accessToken);

    const userGuilds =
      cachedGuilds ||
      (await discordRequest(`${DISCORD_API}/users/@me/guilds`, accessToken));

    if (!cachedGuilds) {
      setCachedGuilds(accessToken, userGuilds);
    }

    await client.guilds.fetch().catch(() => null);

    const botGuildIds = new Set(client.guilds.cache.map((g) => g.id));

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

/* =========================
   CHANNELS
   ========================= */

router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    // ✅ ALSO protect this route
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!isBotReady()) {
      return res.status(503).json({ error: 'Bot is not ready yet.' });
    }

    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));

    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    await guild.channels.fetch().catch(() => null);

    const channels = guild.channels.cache
      .filter((c) => c && (c.type === 0 || c.type === 5))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position ?? 0,
      }))
      .sort((a, b) => {
        const diff = a.position - b.position;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });

    return res.json(channels);
  } catch (error) {
    console.error('❌ Failed to fetch channels:', error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
});

module.exports = router;