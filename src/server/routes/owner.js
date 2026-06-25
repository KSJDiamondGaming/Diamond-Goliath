'use strict';

const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');

const guildManager = require('../../core/guild/guildManager');

const router = express.Router();

const ENVIRONMENT_PORTS = [
  { key: 'dev', environment: 'DEV', port: 3001 },
  { key: 'beta', environment: 'BETA', port: 3011 },
  { key: 'production', environment: 'PRODUCTION', port: 3021 },
];

function shouldLogEnvironmentUnavailable() {
  return process.env.NODE_ENV === 'production';
}

function getOwnerIds() {
  return String(process.env.OWNER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
}

function isOwnerUser(userId) {
  if (!userId) return false;
  return getOwnerIds().includes(String(userId));
}

function isInternalOwnerRequest(req) {
  const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();
  if (!token) return false;
  const headerToken = String(req.headers['x-goliath-owner-token'] || '').trim();
  return headerToken === token;
}

function requireOwner(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  if (!isOwnerUser(req.session.user.id)) return res.status(403).json({ success: false, error: 'Forbidden' });
  return next();
}

function requireOwnerOrInternal(req, res, next) {
  if (isInternalOwnerRequest(req)) return next();
  return requireOwner(req, res, next);
}

function getRuntimeMode() {
  return String(process.env.BOT_MODE || 'dev').trim().toUpperCase();
}

function getDiscordClient(req) {
  return (
    req.client ||
    req.app?.get?.('goliath.client') ||
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    global.client ||
    global.discordClient ||
    null
  );
}

function buildGuildIconUrl(guild) {
  if (!guild?.id || !guild?.icon) return null;
  const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
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
  const incidents = Array.isArray(security.incidents) ? security.incidents : [];
  return incidents.filter(Boolean).map((incident) => ({
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
  const totals = { guilds: guildSecurity.length, incidents: 0, critical: 0, lockdowns: 0, quarantinedUsers: 0, webhookIncidents: 0, protectedGuilds: 0 };
  const recentIncidents = [];

  for (const item of guildSecurity) {
    totals.incidents += Number(item.incidentCount || 0);
    totals.critical += Number(item.criticalIncidents || 0);
    totals.lockdowns += item.lockdownActive ? 1 : 0;
    totals.quarantinedUsers += Number(item.quarantinedCount || 0);
    totals.webhookIncidents += Number(item.webhookIncidents || 0);
    if (item.threatLevel !== 'unknown') totals.protectedGuilds += 1;
    for (const incident of item.recentIncidents || []) recentIncidents.push({ ...incident, guildId: item.guildId, guildName: item.guildName, environment: item.environment });
  }

  recentIncidents.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  return { totals, recentIncidents: recentIncidents.slice(0, 25) };
}

function getPackageInfo() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return { name: pkg.name || 'goliath', version: pkg.version || 'unknown' };
  } catch {
    return { name: 'goliath', version: 'unknown' };
  }
}

function getGitCommitSha() {
  return String(process.env.GITHUB_SHA || process.env.COMMIT_SHA || process.env.GIT_COMMIT || '').trim() || null;
}

function getBuildTime() {
  return String(process.env.BUILD_TIME || process.env.BUILD_DATE || process.env.DEPLOYED_AT || '').trim() || null;
}

function getRuntimePathsStatus() {
  const base = path.join(process.cwd(), 'src', 'runtime', String(process.env.BOT_MODE || 'dev').toLowerCase());
  const folders = ['guilds', 'logs', 'backups', 'data', 'cache'];
  return Object.fromEntries(folders.map((folder) => {
    const fullPath = path.join(base, folder);
    return [folder, { path: fullPath, exists: fs.existsSync(fullPath) }];
  }));
}

function buildModuleSummary() {
  const guildIds = guildManager.getAllGuildIds ? guildManager.getAllGuildIds() : [];
  const moduleTotals = {};

  for (const guildId of guildIds) {
    const data = guildManager.getGuildData(guildId) || {};
    const modules = data.modules || {};
    for (const [key, value] of Object.entries(modules)) {
      if (!moduleTotals[key]) moduleTotals[key] = { key, enabled: 0, disabled: 0, configured: 0 };
      moduleTotals[key].configured += 1;
      if (value && typeof value === 'object' ? value.enabled !== false : value !== false) moduleTotals[key].enabled += 1;
      else moduleTotals[key].disabled += 1;
    }
  }

  return Object.values(moduleTotals).sort((a, b) => a.key.localeCompare(b.key));
}

function buildRuntimePayload(req, forcedEnvironment = getRuntimeMode()) {
  const client = getDiscordClient(req);
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const processMemory = process.memoryUsage();
  const packageInfo = getPackageInfo();
  const guilds = client?.guilds?.cache ? [...client.guilds.cache.values()] : [];
  const wsPing = Number(client?.ws?.ping || 0);
  const readyAt = client?.readyAt?.toISOString?.() || null;
  const uptime = process.uptime();

  return {
    mode: forcedEnvironment,
    environment: forcedEnvironment,
    status: client?.isReady?.() ? 'online' : 'degraded',
    process: {
      pid: process.pid,
      uptime,
      uptimeMs: Math.round(uptime * 1000),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      packageName: packageInfo.name,
      version: packageInfo.version,
      commitSha: getGitCommitSha(),
      buildTime: getBuildTime(),
    },
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      cpuCount: os.cpus().length,
      loadAverage: os.loadavg(),
      uptime: os.uptime(),
      memory: { total: totalMemory, free: freeMemory, used: totalMemory - freeMemory },
    },
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: totalMemory - freeMemory,
      process: {
        rss: processMemory.rss,
        heapTotal: processMemory.heapTotal,
        heapUsed: processMemory.heapUsed,
        external: processMemory.external,
        arrayBuffers: processMemory.arrayBuffers,
      },
    },
    discord: {
      ready: Boolean(client?.isReady?.()),
      userId: client?.user?.id || null,
      username: client?.user?.tag || client?.user?.username || null,
      readyAt,
      wsStatus: client?.ws?.status ?? null,
      wsPing,
      guildCount: guilds.length,
      memberCount: guilds.reduce((sum, guild) => sum + Number(guild.memberCount || 0), 0),
    },
    services: {
      dashboardApi: 'online',
      discordGateway: client?.isReady?.() ? 'online' : 'offline',
      guildJson: 'online',
      backupWorker: 'available',
      socketHub: 'available',
    },
    runtimePaths: getRuntimePathsStatus(),
    modules: buildModuleSummary(),
    checkedAt: new Date().toISOString(),
  };
}

function summariseRuntimeEnvironments(environments = []) {
  return {
    total: environments.length,
    online: environments.filter((env) => env.status === 'online').length,
    degraded: environments.filter((env) => env.status === 'degraded').length,
    offline: environments.filter((env) => env.status === 'offline').length,
    guilds: environments.reduce((sum, env) => sum + Number(env.discord?.guildCount || 0), 0),
    members: environments.reduce((sum, env) => sum + Number(env.discord?.memberCount || 0), 0),
  };
}

async function fetchEnvironmentGuilds(port, environment) {
  try {
    const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();
    const response = await fetch(`http://127.0.0.1:${port}/api/owner/guilds`, { headers: { 'x-goliath-owner-token': token } });
    if (!response.ok) {
      console.warn(`[OWNER GUILDS ALL] ${environment} returned ${response.status}`);
      return [];
    }
    const payload = await response.json();
    const guilds = Array.isArray(payload.guilds) ? payload.guilds : [];
    return guilds.map((guild) => ({ ...guild, environment, runtimeMode: environment, sourcePort: port }));
  } catch (error) {
    if (shouldLogEnvironmentUnavailable()) console.warn(`[OWNER GUILDS ALL] ${environment} unavailable on port ${port}:`, error.message);
    return [];
  }
}

async function fetchEnvironmentSecurity(port, environment) {
  try {
    const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();
    const response = await fetch(`http://127.0.0.1:${port}/api/owner/security`, { headers: { 'x-goliath-owner-token': token } });
    if (!response.ok) {
      console.warn(`[OWNER SECURITY ALL] ${environment} returned ${response.status}`);
      return [];
    }
    const payload = await response.json();
    const guilds = Array.isArray(payload.guilds) ? payload.guilds : [];
    return guilds.map((guild) => ({ ...guild, environment, runtimeMode: environment, sourcePort: port }));
  } catch (error) {
    if (shouldLogEnvironmentUnavailable()) console.warn(`[OWNER SECURITY ALL] ${environment} unavailable on port ${port}:`, error.message);
    return [];
  }
}

async function fetchEnvironmentRuntime(port, environment) {
  try {
    const token = String(process.env.OWNER_INTERNAL_TOKEN || '').trim();
    const response = await fetch(`http://127.0.0.1:${port}/api/owner/runtime/local`, { headers: { 'x-goliath-owner-token': token } });
    if (!response.ok) return { environment, mode: environment, status: 'offline', port, error: `HTTP ${response.status}` };
    const payload = await response.json();
    return { ...(payload.runtime || {}), environment, mode: environment, port, sourcePort: port };
  } catch (error) {
    if (shouldLogEnvironmentUnavailable()) console.warn(`[OWNER RUNTIME ALL] ${environment} unavailable on port ${port}:`, error.message);
    return { environment, mode: environment, status: 'offline', port, error: error.message };
  }
}

/* ==================================================
   OWNER INFO
================================================== */
router.get('/me', requireOwner, (req, res) => {
  return res.json({ success: true, owner: true, user: req.session.user, mode: getRuntimeMode() });
});

/* ==================================================
   OWNER GUILDS
================================================== */
router.get('/guilds', requireOwnerOrInternal, (req, res) => {
  const client = getDiscordClient(req);
  const mode = getRuntimeMode();
  if (!client?.guilds?.cache) return res.status(503).json({ success: false, error: 'Discord client unavailable.' });

  const guilds = [...client.guilds.cache.values()].map((guild) => buildOwnerGuildPayload(guild, mode)).sort((a, b) => a.name.localeCompare(b.name));
  const byEnvironment = { dev: mode === 'DEV' ? guilds : [], beta: mode === 'BETA' ? guilds : [], production: mode === 'PRODUCTION' ? guilds : [] };
  return res.json({ success: true, owner: true, mode, runtimeMode: mode, guilds, ...byEnvironment });
});

router.get('/guilds/all', requireOwnerOrInternal, async (req, res) => {
  try {
    const results = await Promise.all(ENVIRONMENT_PORTS.map((environmentConfig) => fetchEnvironmentGuilds(environmentConfig.port, environmentConfig.environment)));
    const devGuilds = results[0] || [];
    const betaGuilds = results[1] || [];
    const productionGuilds = results[2] || [];
    const guilds = [...devGuilds, ...betaGuilds, ...productionGuilds].sort((a, b) => {
      const environmentOrder = { DEV: 1, BETA: 2, PRODUCTION: 3 };
      const environmentCompare = (environmentOrder[a.environment] || 99) - (environmentOrder[b.environment] || 99);
      if (environmentCompare !== 0) return environmentCompare;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return res.json({ success: true, owner: true, mode: 'GLOBAL', runtimeMode: 'GLOBAL', guilds, dev: devGuilds, beta: betaGuilds, production: productionGuilds, environments: { dev: { port: 3001, guilds: devGuilds.length }, beta: { port: 3011, guilds: betaGuilds.length }, production: { port: 3021, guilds: productionGuilds.length } } });
  } catch (error) {
    console.error('[OWNER GUILDS ALL]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ==================================================
   GLOBAL SECURITY CENTER
================================================== */
router.get('/security', requireOwnerOrInternal, (req, res) => {
  const client = getDiscordClient(req);
  const mode = getRuntimeMode();
  if (!client?.guilds?.cache) return res.status(503).json({ success: false, error: 'Discord client unavailable.' });
  const guilds = [...client.guilds.cache.values()].map((guild) => buildGuildSecurityOverview(buildOwnerGuildPayload(guild, mode), mode)).sort((a, b) => String(a.guildName || '').localeCompare(String(b.guildName || '')));
  const summary = summariseSecurityGuilds(guilds);
  return res.json({ success: true, owner: true, mode, runtimeMode: mode, guilds, ...summary, updatedAt: new Date().toISOString() });
});

router.get('/security/all', requireOwner, async (req, res) => {
  try {
    const requestedEnvironment = String(req.query.environment || 'all').toUpperCase();
    const results = await Promise.all(ENVIRONMENT_PORTS.map((environmentConfig) => fetchEnvironmentSecurity(environmentConfig.port, environmentConfig.environment)));
    let guilds = [...(results[0] || []), ...(results[1] || []), ...(results[2] || [])];
    if (requestedEnvironment !== 'ALL') guilds = guilds.filter((guild) => String(guild.environment || '').toUpperCase() === requestedEnvironment);
    const summary = summariseSecurityGuilds(guilds);
    return res.json({ success: true, owner: true, mode: 'GLOBAL', runtimeMode: 'GLOBAL', environment: requestedEnvironment, guilds, ...summary, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[OWNER SECURITY ALL]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ==================================================
   RUNTIME MONITOR
================================================== */
router.get('/runtime/local', requireOwnerOrInternal, async (req, res) => {
  try {
    return res.json({ success: true, owner: true, runtime: buildRuntimePayload(req, getRuntimeMode()) });
  } catch (error) {
    console.error('[OWNER RUNTIME LOCAL]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/runtime', requireOwner, async (req, res) => {
  try {
    const environments = await Promise.all(ENVIRONMENT_PORTS.map((environmentConfig) => fetchEnvironmentRuntime(environmentConfig.port, environmentConfig.environment)));
    const current = buildRuntimePayload(req, getRuntimeMode());
    return res.json({ success: true, owner: true, mode: 'GLOBAL', runtimeMode: 'GLOBAL', runtime: { ...current, environments, summary: summariseRuntimeEnvironments(environments) }, environments, summary: summariseRuntimeEnvironments(environments), updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[OWNER RUNTIME]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
