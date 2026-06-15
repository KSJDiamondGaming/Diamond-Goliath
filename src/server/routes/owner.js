'use strict';

const express = require('express');
const os = require('os');

const router = express.Router();

const ENVIRONMENT_PORTS = [
  {
    key: 'dev',
    environment: 'DEV',
    port: 3001,
  },
  {
    key: 'beta',
    environment: 'BETA',
    port: 3011,
  },
  {
    key: 'production',
    environment: 'PRODUCTION',
    port: 3021,
  },
];

function getOwnerIds() {
  return String(process.env.OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isOwnerUser(userId) {
  if (!userId) return false;

  return getOwnerIds().includes(String(userId));
}

function requireOwner(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated.',
    });
  }

  if (!isOwnerUser(req.session.user.id)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
    });
  }

  return next();
}

function getRuntimeMode() {
  return String(process.env.BOT_MODE || 'dev')
    .trim()
    .toUpperCase();
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

function buildGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) return null;

  const ext = String(guild.icon).startsWith('a_')
    ? 'gif'
    : 'png';

  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=256`;
}

function buildOwnerGuildPayload(guild, forcedEnvironment = null) {
  const mode = forcedEnvironment || getRuntimeMode();
  const iconUrl = buildGuildIconUrl(guild);

  return {
    id: guild.id,
    guildId: guild.id,
    name: guild.name,
    guildName: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    environment: mode,
    runtimeMode: mode,
    memberCount: Number(guild.memberCount || 0),
    ownerId: guild.ownerId || null,
    ownerName: null,
    botConnected: true,
    connected: true,
    status: 'connected',
  };
}

async function fetchEnvironmentGuilds(port, environment, cookie) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/owner/guilds`,
      {
        headers: {
          Cookie: cookie || '',
        },
      },
    );

    if (!response.ok) {
      console.warn(
        `[OWNER GUILDS ALL] ${environment} returned ${response.status}`,
      );

      return [];
    }

    const payload = await response.json();

    const guilds = Array.isArray(payload.guilds)
      ? payload.guilds
      : [];

    return guilds.map((guild) => ({
      ...guild,
      environment,
      runtimeMode: environment,
      sourcePort: port,
    }));
  } catch (error) {
    console.error(
      `[OWNER GUILDS ALL] ${environment} failed:`,
      error.message,
    );

    return [];
  }
}

/* ==================================================
   OWNER INFO
================================================== */

router.get('/me', requireOwner, (req, res) => {
  return res.json({
    success: true,
    owner: true,
    user: req.session.user,
    mode: getRuntimeMode(),
  });
});

/* ==================================================
   OWNER GUILDS
================================================== */

router.get('/guilds', requireOwner, (req, res) => {
  const client = getDiscordClient(req);
  const mode = getRuntimeMode();

  if (!client?.guilds?.cache) {
    return res.status(503).json({
      success: false,
      error: 'Discord client unavailable.',
    });
  }

  const guilds = [...client.guilds.cache.values()]
    .map((guild) => buildOwnerGuildPayload(guild, mode))
    .sort((a, b) => a.name.localeCompare(b.name));

  const byEnvironment = {
    dev: mode === 'DEV' ? guilds : [],
    beta: mode === 'BETA' ? guilds : [],
    production: mode === 'PRODUCTION' ? guilds : [],
  };

  return res.json({
    success: true,
    owner: true,
    mode,
    runtimeMode: mode,
    guilds,
    ...byEnvironment,
  });
});

router.get('/guilds/all', requireOwner, async (req, res) => {
  try {
    const cookie = req.headers.cookie || '';

    const results = await Promise.all(
      ENVIRONMENT_PORTS.map((environmentConfig) =>
        fetchEnvironmentGuilds(
          environmentConfig.port,
          environmentConfig.environment,
          cookie,
        ),
      ),
    );

    const devGuilds = results[0] || [];
    const betaGuilds = results[1] || [];
    const productionGuilds = results[2] || [];

    const guilds = [
      ...devGuilds,
      ...betaGuilds,
      ...productionGuilds,
    ].sort((a, b) => {
      const environmentOrder = {
        DEV: 1,
        BETA: 2,
        PRODUCTION: 3,
      };

      const environmentCompare =
        (environmentOrder[a.environment] || 99) -
        (environmentOrder[b.environment] || 99);

      if (environmentCompare !== 0) {
        return environmentCompare;
      }

      return String(a.name || '').localeCompare(
        String(b.name || ''),
      );
    });

    return res.json({
      success: true,
      owner: true,

      mode: 'GLOBAL',
      runtimeMode: 'GLOBAL',

      guilds,

      dev: devGuilds,
      beta: betaGuilds,
      production: productionGuilds,

      environments: {
        dev: {
          port: 3001,
          guilds: devGuilds.length,
        },
        beta: {
          port: 3011,
          guilds: betaGuilds.length,
        },
        production: {
          port: 3021,
          guilds: productionGuilds.length,
        },
      },
    });
  } catch (error) {
    console.error('[OWNER GUILDS ALL]', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/* ==================================================
   RUNTIME MONITOR
================================================== */

router.get('/runtime', requireOwner, async (req, res) => {
  try {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return res.json({
      success: true,

      runtime: {
        mode: getRuntimeMode(),

        uptime: process.uptime(),

        nodeVersion: process.version,

        platform: process.platform,

        hostname: os.hostname(),

        cpuCount: os.cpus().length,

        memory: {
          total: totalMemory,
          free: freeMemory,
          used: totalMemory - freeMemory,
        },
      },
    });
  } catch (error) {
    console.error('[OWNER RUNTIME]', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;