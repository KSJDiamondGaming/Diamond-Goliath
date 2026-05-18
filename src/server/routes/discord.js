const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

const GUILD_CACHE_TTL_MS = 15 * 1000;

const ADMINISTRATOR_PERMISSION = BigInt(0x8);
const MANAGE_GUILD_PERMISSION = BigInt(0x20);

const guildCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      'Missing bot token. Set DISCORD_TOKEN, TOKEN, or DISCORD_BOT_TOKEN in your environment.'
    );
  }

  return token;
}

function getBotMode() {
  return String(process.env.BOT_MODE || process.env.NODE_ENV || '')
    .trim()
    .toUpperCase();
}

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

  return getConfiguredDevGuildIds().includes(String(guildId));
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

    const isAdministrator =
      (permissions & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;

    const canManageGuild =
      (permissions & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;

    return isAdministrator || canManageGuild;
  } catch {
    return false;
  }
}

function canAccessGuild(guild, botGuildIds) {
  const guildId = String(guild?.id || '');

  if (!guildId) return false;

  if (!botGuildIds.has(guildId)) {
    return false;
  }

  if (hasManageGuildPermission(guild)) {
    return true;
  }

  return isConfiguredDevGuild(guildId);
}

function getPermissionDebug(guild) {
  const guildId = String(guild?.id || '');

  if (guild?.owner) {
    return {
      owner: true,
      administrator: true,
      manageGuild: true,
      devGuildBypass: isConfiguredDevGuild(guildId),
      allowed: true,
    };
  }

  try {
    const permissions = BigInt(guild?.permissions || 0);

    const administrator =
      (permissions & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;

    const manageGuild =
      (permissions & MANAGE_GUILD_PERMISSION) === MANAGE_GUILD_PERMISSION;

    const devGuildBypass = isConfiguredDevGuild(guildId);

    return {
      owner: false,
      administrator,
      manageGuild,
      devGuildBypass,
      allowed: administrator || manageGuild || devGuildBypass,
    };
  } catch {
    const devGuildBypass = isConfiguredDevGuild(guildId);

    return {
      owner: false,
      administrator: false,
      manageGuild: false,
      devGuildBypass,
      allowed: devGuildBypass,
    };
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

function getDiscordClient(req) {
  return (
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    req.app?.get?.('client') ||
    req.app?.get?.('discordClient') ||
    req.client ||
    global.client ||
    global.discordClient ||
    null
  );
}

function getClientGuilds(req) {
  const client = getDiscordClient(req);

  if (!client?.guilds?.cache) return [];

  return [...client.guilds.cache.values()].map((guild) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
  }));
}

function getGuildFromClient(req, guildId) {
  const client = getDiscordClient(req);

  if (!client?.guilds?.cache) {
    return null;
  }

  return client.guilds.cache.get(String(guildId)) || null;
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

async function fetchBotGuilds(req) {
  const clientGuilds = getClientGuilds(req);

  if (clientGuilds.length > 0) {
    return clientGuilds;
  }

  const botToken = requireBotToken();

  return fetchJson(`${DISCORD_API}/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
}

function buildGuildPayload(guild) {
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
      fetchBotGuilds(req),
    ]);

    const botGuildIds = new Set(
      Array.isArray(botGuilds)
        ? botGuilds.map((guild) => String(guild.id))
        : []
    );

    const mutualGuilds = Array.isArray(userGuilds)
      ? userGuilds
          .filter((guild) => canAccessGuild(guild, botGuildIds))
          .map(buildGuildPayload)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

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

router.get('/debug-guilds', async (req, res) => {
  try {
    const accessToken = getSessionAccessToken(req);

    if (!req.session?.user || !accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [userGuilds, botGuilds] = await Promise.all([
      fetchUserGuilds(accessToken),
      fetchBotGuilds(req),
    ]);

    const botGuildIds = new Set(
      Array.isArray(botGuilds)
        ? botGuilds.map((guild) => String(guild.id))
        : []
    );

    const mutualGuilds = Array.isArray(userGuilds)
      ? userGuilds.filter((guild) => botGuildIds.has(String(guild.id)))
      : [];

    const allowedGuilds = mutualGuilds.filter((guild) =>
      canAccessGuild(guild, botGuildIds)
    );

    return res.json({
      mode: getBotMode(),
      configuredDevGuildIds: getConfiguredDevGuildIds(),
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        globalName: req.session.user.global_name,
      },
      counts: {
        userGuilds: Array.isArray(userGuilds) ? userGuilds.length : 0,
        botGuilds: Array.isArray(botGuilds) ? botGuilds.length : 0,
        mutualGuilds: mutualGuilds.length,
        allowedGuilds: allowedGuilds.length,
      },
      userGuilds: Array.isArray(userGuilds)
        ? userGuilds.map((guild) => ({
            id: guild.id,
            name: guild.name,
            botInGuild: botGuildIds.has(String(guild.id)),
            permissions: guild.permissions,
            permissionDebug: getPermissionDebug(guild),
          }))
        : [],
      botGuilds: Array.isArray(botGuilds)
        ? botGuilds.map((guild) => ({
            id: guild.id,
            name: guild.name,
          }))
        : [],
    });
  } catch (error) {
    console.error('❌ Failed to debug guilds:', error);

    return res.status(500).json({
      error: 'Failed to debug guilds',
      message: error.message,
    });
  }
});

router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!req.session?.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const guild = getGuildFromClient(req, guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Guild not found in Discord client cache',
        guildId,
      });
    }

    await guild.channels.fetch().catch(() => null);

    const channels = guild.channels.cache
      .filter((channel) => channel?.id && channel?.name)
      .filter(
        (channel) =>
          channel.type === 0 || // GuildText
          channel.type === 5 // GuildAnnouncement
      )
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.rawPosition ?? channel.position ?? 0,
        parentId: channel.parentId || null,
      }))
      .sort((a, b) => {
        const positionDiff = a.position - b.position;

        if (positionDiff !== 0) {
          return positionDiff;
        }

        return a.name.localeCompare(b.name);
      });

    return res.json({
      success: true,
      guildId,
      count: channels.length,
      channels,
    });
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch guild channels',
    });
  }
});

router.get('/guilds/:guildId/roles', async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!req.session?.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    const guild = getGuildFromClient(req, guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Guild not found in Discord client cache',
        guildId,
      });
    }

    await guild.roles.fetch().catch(() => null);

    const roles = guild.roles.cache
      .filter((role) => role?.id && role?.name)
      .filter((role) => role.id !== guild.id)
      .filter((role) => !role.managed)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor || '#99aab5',
        position: role.position ?? 0,
        managed: Boolean(role.managed),
        editable: Boolean(role.editable),
      }))
      .sort((a, b) => {
        const positionDiff = b.position - a.position;

        if (positionDiff !== 0) {
          return positionDiff;
        }

        return a.name.localeCompare(b.name);
      });

    return res.json({
      success: true,
      guildId,
      count: roles.length,
      roles,
    });
  } catch (error) {
    console.error('❌ Failed to fetch guild roles:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch guild roles',
    });
  }
});

module.exports = router;