const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

const GUILD_CACHE_TTL_MS = 15 * 1000;

const ADMINISTRATOR_PERMISSION = BigInt(0x8);
const MANAGE_GUILD_PERMISSION = BigInt(0x20);

const guildCache = new Map();

/* ---------------- UTIL ---------------- */

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function getBotToken() {
  return String(
    process.env.DISCORD_TOKEN ||
      process.env.TOKEN ||
      process.env.DISCORD_BOT_TOKEN ||
      ''
  ).trim();
}

function requireBotToken() {
  const token = getBotToken();

  if (!token) {
    throw new Error(
      'Missing bot token environment variable'
    );
  }

  return token;
}

function getBotMode() {
  return String(
    process.env.BOT_MODE ||
      process.env.NODE_ENV ||
      'production'
  )
    .trim()
    .toUpperCase();
}

/* ---------------- OWNERS ---------------- */

function getOwnerIds() {
  return [
    process.env.OWNER_IDS,
    process.env.OWNER_ID,
    process.env.BOT_OWNER_ID,
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
}

function isBotOwnerUser(userId) {
  return getOwnerIds().includes(
    String(userId)
  );
}

/* ---------------- DEV GUILDS ---------------- */

function getConfiguredDevGuildIds() {
  return [
    process.env.DEV_GUILD_ID,
    process.env.MAIN_GUILD_ID,
    process.env.GUILD_ID,
  ]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
}

function isConfiguredDevGuild(guildId) {
  const mode = getBotMode();

  if (mode !== 'DEV') {
    return false;
  }

  return getConfiguredDevGuildIds().includes(
    String(guildId)
  );
}

/* ---------------- CACHE ---------------- */

function getCache(cache, cacheKey) {
  const cached = cache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCache(
  cache,
  cacheKey,
  data,
  ttlMs
) {
  cache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/* ---------------- PERMISSIONS ---------------- */

function hasManageGuildPermission(
  guild
) {
  if (guild?.owner) {
    return true;
  }

  try {
    const permissions = BigInt(
      guild?.permissions || 0
    );

    const isAdministrator =
      (permissions &
        ADMINISTRATOR_PERMISSION) ===
      ADMINISTRATOR_PERMISSION;

    const canManageGuild =
      (permissions &
        MANAGE_GUILD_PERMISSION) ===
      MANAGE_GUILD_PERMISSION;

    return (
      isAdministrator || canManageGuild
    );
  } catch {
    return false;
  }
}

function canAccessGuild(
  guild,
  botGuildIds,
  userId
) {
  const guildId = String(
    guild?.id || ''
  );

  if (!guildId) {
    return false;
  }

  if (!botGuildIds.has(guildId)) {
    return false;
  }

  /* OWNER BYPASS */

  if (isBotOwnerUser(userId)) {
    return true;
  }

  /* NORMAL ACCESS */

  if (
    hasManageGuildPermission(guild)
  ) {
    return true;
  }

  return isConfiguredDevGuild(
    guildId
  );
}

/* ---------------- DISCORD HELPERS ---------------- */

function buildGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) {
    return null;
  }

  const ext = String(
    guild.icon
  ).startsWith('a_')
    ? 'gif'
    : 'png';

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

function getDiscordClient(req) {
  return (
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    global.client ||
    global.discordClient ||
    null
  );
}

function getClientGuilds(req) {
  const client =
    getDiscordClient(req);

  if (!client?.guilds?.cache) {
    return [];
  }

  return [
    ...client.guilds.cache.values(),
  ].map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
  }));
}

/* ---------------- FETCH ---------------- */

async function fetchJson(
  url,
  options = {},
  retryCount = 0
) {
  const response = await fetch(
    url,
    options
  );

  if (response.status === 429) {
    let retryAfterMs = 1000;

    try {
      const data =
        await response.json();

      const retryAfter = Number(
        data?.retry_after
      );

      if (
        !Number.isNaN(retryAfter)
      ) {
        retryAfterMs =
          retryAfter * 1000;
      }
    } catch {}

    if (retryCount < 3) {
      await sleep(
        retryAfterMs + 150
      );

      return fetchJson(
        url,
        options,
        retryCount + 1
      );
    }

    throw new Error(
      'Discord rate limit exceeded'
    );
  }

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Request failed ${response.status}: ${text}`
    );
  }

  return response.json();
}

async function fetchUserGuilds(
  accessToken
) {
  return fetchJson(
    `${DISCORD_API}/users/@me/guilds`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

async function fetchBotGuilds(req) {
  const clientGuilds =
    getClientGuilds(req);

  if (clientGuilds.length > 0) {
    return clientGuilds;
  }

  const botToken =
    requireBotToken();

  return fetchJson(
    `${DISCORD_API}/users/@me/guilds`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    }
  );
}

function buildGuildPayload(guild) {
  const iconUrl =
    buildGuildIconUrl(guild);

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    owner: Boolean(guild.owner),
    permissions: guild.permissions,
  };
}

/* ---------------- GUILDS ROUTE ---------------- */

router.get(
  '/guilds',
  async (req, res) => {
    try {
      const accessToken =
        getSessionAccessToken(req);

      if (
        !req.session?.user ||
        !accessToken
      ) {
        return res
          .status(401)
          .json({
            error:
              'Not authenticated',
          });
      }

      const userId =
        req.session.user.id;

      const cacheKey = `guilds:${userId}`;

      const cachedGuilds =
        getCache(
          guildCache,
          cacheKey
        );

      if (cachedGuilds) {
        return res.json(
          cachedGuilds
        );
      }

      const [
        userGuilds,
        botGuilds,
      ] = await Promise.all([
        fetchUserGuilds(
          accessToken
        ),
        fetchBotGuilds(req),
      ]);

      const botGuildIds =
        new Set(
          Array.isArray(botGuilds)
            ? botGuilds.map(
                (guild) =>
                  String(guild.id)
              )
            : []
        );

        if (isBotOwnerUser(userId)) {
  const ownerGuilds = Array.isArray(botGuilds)
    ? botGuilds
        .map(buildGuildPayload)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  setCache(
    guildCache,
    cacheKey,
    ownerGuilds,
    GUILD_CACHE_TTL_MS
  );

  return res.json(ownerGuilds);
}

      const mutualGuilds =
        Array.isArray(userGuilds)
          ? userGuilds
              .filter((guild) =>
                canAccessGuild(
                  guild,
                  botGuildIds,
                  userId
                )
              )
              .map(
                buildGuildPayload
              )
              .sort((a, b) =>
                a.name.localeCompare(
                  b.name
                )
              )
          : [];

      setCache(
        guildCache,
        cacheKey,
        mutualGuilds,
        GUILD_CACHE_TTL_MS
      );

      return res.json(
        mutualGuilds
      );
    } catch (error) {
      console.error(
        '❌ Failed to fetch guilds:',
        error
      );

      return res.status(500).json({
        error:
          'Failed to fetch guilds',
      });
    }
  }
);

module.exports = router;