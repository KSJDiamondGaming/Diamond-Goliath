'use strict';

const express = require('express');
const os = require('os');

const router = express.Router();

function splitIds(value) {
  return String(value || '').split(',').map((id) => id.trim()).filter(Boolean);
}

function getOwnerIds() {
  return [...new Set([
    ...splitIds(process.env.OWNER_ID),
    ...splitIds(process.env.OWNER_IDS),
    ...splitIds(process.env.BOT_OWNER_ID),
    ...splitIds(process.env.BOT_OWNER_IDS),
  ])];
}

function isOwnerUser(userId) {
  if (!userId) return false;
  return getOwnerIds().includes(String(userId));
}

function requireOwner(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }

  if (!isOwnerUser(req.session.user.id)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      diagnostics: {
        sessionUserId: req.session.user.id,
        ownerMatch: false,
        ownerIdCount: getOwnerIds().length,
        configuredOwnerKeys: getConfiguredOwnerKeys(),
      },
    });
  }

  return next();
}

function getConfiguredOwnerKeys() {
  return {
    OWNER_ID: splitIds(process.env.OWNER_ID).length,
    OWNER_IDS: splitIds(process.env.OWNER_IDS).length,
    BOT_OWNER_ID: splitIds(process.env.BOT_OWNER_ID).length,
    BOT_OWNER_IDS: splitIds(process.env.BOT_OWNER_IDS).length,
  };
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

function getRuntimeMode() {
  return String(process.env.BOT_MODE || 'dev').trim().toUpperCase();
}

function getSafeEnvSummary() {
  return {
    NODE_ENV: process.env.NODE_ENV || 'unset',
    BOT_MODE: process.env.BOT_MODE || 'unset',
    PORT: process.env.PORT || process.env.BOT_API_PORT || 'unset',
    CLIENT_URL: Boolean(process.env.CLIENT_URL),
    DASHBOARD_CLIENT_URL: Boolean(process.env.DASHBOARD_CLIENT_URL),
    DISCORD_CLIENT_ID: Boolean(process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID),
    DISCORD_REDIRECT_URI: Boolean(process.env.DISCORD_REDIRECT_URI),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET),
    OWNER_INTERNAL_TOKEN: Boolean(process.env.OWNER_INTERNAL_TOKEN),
  };
}

router.get('/', requireOwner, (req, res) => {
  const client = getDiscordClient(req);
  const guildCount = client?.guilds?.cache?.size || 0;
  const ownerIds = getOwnerIds();
  const sessionUserId = String(req.session?.user?.id || '');

  return res.json({
    success: true,
    checkedAt: new Date().toISOString(),
    mode: getRuntimeMode(),
    auth: {
      authenticated: Boolean(req.session?.user),
      sessionUserId,
      sessionUserName: req.session?.user?.username || req.session?.user?.displayName || null,
      sessionOwnerFlag: req.session?.user?.isOwner === true,
      ownerMatch: isOwnerUser(sessionUserId),
      ownerIdCount: ownerIds.length,
      configuredOwnerKeys: getConfiguredOwnerKeys(),
    },
    routes: {
      authMe: '/api/auth/me',
      ownerMe: '/api/owner/me',
      ownerGuilds: '/api/owner/guilds/all',
      ownerDiagnostics: '/api/owner/diagnostics',
    },
    runtime: {
      pid: process.pid,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      hostname: os.hostname(),
      platform: process.platform,
    },
    discord: {
      clientAvailable: Boolean(client),
      ready: Boolean(client?.isReady?.()),
      username: client?.user?.tag || client?.user?.username || null,
      guildCount,
      wsPing: client?.ws?.ping ?? null,
    },
    environment: getSafeEnvSummary(),
  });
});

module.exports = router;
