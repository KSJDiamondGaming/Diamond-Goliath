'use strict';

const express = require('express');
const os = require('os');

const guildManager = require('../../core/guild/guildManager');

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

function shouldLogEnvironmentUnavailable() {
  return process.env.NODE_ENV === 'production';
}

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

function isInternalOwnerRequest(req) {
  const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();

  if (!token) return false;

  const headerToken = String(
    req.headers['x-goliath-owner-token'] || '',
  ).trim();

  return headerToken === token;
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

function requireOwnerOrInternal(req, res, next) {
  if (isInternalOwnerRequest(req)) {
    return next();
  }

  return requireOwner(req, res, next);
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

function normaliseSecurityIncidents(security = {}) {
  const incidents = Array.isArray(security.incidents)
    ? security.incidents
    : [];

  return incidents
    .filter(Boolean)
    .map((incident) => ({
      ...incident,
      severity: incident.severity || incident.level || 'info',
      type: incident.type || incident.eventType || incident.action || 'security_event',
      timestamp: incident.timestamp || incident.createdAt || incident.time || null,
    }));
}

function buildGuildSecurityOverview(guild, environment = getRuntimeMode()) {
  const guildId = guild.guildId || guild.id;
  const security = guildManager.getSecurityConfig(guildId) || {};
  const incidents = normaliseSecurityIncidents(security);
  const lockdown = security.lockdown || { active: false };
  const quarantine = security.quarantine || { users: {} };
  const quarantinedCount = Object.keys(quarantine.users || {}).length;
  const criticalIncidents = incidents.filter((incident) => String(incident.severity || '').toLowerCase() === 'critical').length;
  const webhookIncidents = incidents.filter((incident) => String(incident.type || '').toLowerCase().includes('webhook')).length;

  return {
    guildId,
    guildName: guild.guildName || guild.name || 'Unknown Guild',
    environment,
    threatLevel: security.threatLevel || 'low',
    incidentCount: Number(security.totalIncidents || incidents.length || 0),
    criticalIncidents: Number(security.criticalIncidents || criticalIncidents || 0),
    webhookIncidents,
    lockdownActive: Boolean(lockdown.active),
    quarantinedCount,
    recentIncidents: incidents.slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}

function summariseSecurityGuilds(guildSecurity = []) {
  const totals = {
    guilds: guildSecurity.length,
    incidents: 0,
    critical: 0,
    lockdowns: 0,
    quarantinedUsers: 0,
    webhookIncidents: 0,
    protectedGuilds: 0,
  };

  const recentIncidents = [];

  for (const item of guildSecurity) {
    totals.incidents += Number(item.incidentCount || 0);
    totals.critical += Number(item.criticalIncidents || 0);
    totals.lockdowns += item.lockdownActive ? 1 : 0;
    totals.quarantinedUsers += Number(item.quarantinedCount || 0);
    totals.webhookIncidents += Number(item.webhookIncidents || 0);

    if (item.threatLevel !== 'unknown') {
      totals.protectedGuilds += 1;
    }

    for (const incident of item.recentIncidents || []) {
      recentIncidents.push({
        ...incident,
        guildId: item.guildId,
        guildName: item.guildName,
        environment: item.environment,
      });
    }
  }

  recentIncidents.sort((a, b) => {
    const left = new Date(a.timestamp || 0).getTime();
    const right = new Date(b.timestamp || 0).getTime();
    return right - left;
  });

  return {
    totals,
    recentIncidents: recentIncidents.slice(0, 25),
  };
}

async function fetchEnvironmentGuilds(port, environment) {
  try {
    const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();

    const response = await fetch(
      `http://127.0.0.1:${port}/api/owner/guilds`,
      {
        headers: {
          'x-goliath-owner-token': token,
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
    if (shouldLogEnvironmentUnavailable()) {
      console.warn(
        `[OWNER GUILDS ALL] ${environment} unavailable on port ${port}:`,
        error.message,
      );
    }

    return [];
  }
}

async function fetchEnvironmentSecurity(port, environment) {
  try {
    const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();

    const response = await fetch(
      `http://127.0.0.1:${port}/api/owner/security`,
      {
        headers: {
          'x-goliath-owner-token': token,
        },
      },
    );

    if (!response.ok) {
      console.warn(
        `[OWNER SECURITY ALL] ${environment} returned ${response.status}`,
      );

      return [];
    }

    const payload = await response.json();
    const guilds = Array.isArray(payload.guilds) ? payload.guilds : [];

    return guilds.map((guild) => ({
      ...guild,
      environment,
      runtimeMode: environment,
      sourcePort: port,
    }));
  } catch (error) {
    if (shouldLogEnvironmentUnavailable()) {
      console.warn(
        `[OWNER SECURITY ALL] ${environment} unavailable on port ${port}:`,
        error.message,
      );
    }

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
router.get('/guilds', requireOwnerOrInternal, (req, res) => {
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

router.get('/guilds/all', requireOwnerOrInternal, async (req, res) => {
  try {
    const results = await Promise.all(
      ENVIRONMENT_PORTS.map((environmentConfig) =>
        fetchEnvironmentGuilds(
          environmentConfig.port,
          environmentConfig.environment,
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
   GLOBAL SECURITY CENTER
================================================== */
router.get('/security', requireOwnerOrInternal, (req, res) => {
  const client = getDiscordClient(req);
  const mode = getRuntimeMode();

  if (!client?.guilds?.cache) {
    return res.status(503).json({
      success: false,
      error: 'Discord client unavailable.',
    });
  }

  const guilds = [...client.guilds.cache.values()]
    .map((guild) => buildGuildSecurityOverview(buildOwnerGuildPayload(guild, mode), mode))
    .sort((a, b) => String(a.guildName || '').localeCompare(String(b.guildName || '')));

  const summary = summariseSecurityGuilds(guilds);

  return res.json({
    success: true,
    owner: true,
    mode,
    runtimeMode: mode,
    guilds,
    ...summary,
    updatedAt: new Date().toISOString(),
  });
});

router.get('/security/all', requireOwner, async (req, res) => {
  try {
    const requestedEnvironment = String(req.query.environment || 'all').toUpperCase();
    const results = await Promise.all(
      ENVIRONMENT_PORTS.map((environmentConfig) =>
        fetchEnvironmentSecurity(
          environmentConfig.port,
          environmentConfig.environment,
        ),
      ),
    );

    let guilds = [
      ...(results[0] || []),
      ...(results[1] || []),
      ...(results[2] || []),
    ];

    if (requestedEnvironment !== 'ALL') {
      guilds = guilds.filter((guild) => String(guild.environment || '').toUpperCase() === requestedEnvironment);
    }

    const summary = summariseSecurityGuilds(guilds);

    return res.json({
      success: true,
      owner: true,
      mode: 'GLOBAL',
      runtimeMode: 'GLOBAL',
      environment: requestedEnvironment,
      guilds,
      ...summary,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[OWNER SECURITY ALL]', error);

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
