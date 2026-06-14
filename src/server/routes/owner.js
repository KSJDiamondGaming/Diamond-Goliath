'use strict';

const express = require('express');

const router = express.Router();

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
  return String(process.env.BOT_MODE || 'dev').trim().toUpperCase();
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

  const ext = String(guild.icon).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=256`;
}

function buildOwnerGuildPayload(guild) {
  const mode = getRuntimeMode();
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

router.get('/me', requireOwner, (req, res) => {
  return res.json({
    success: true,
    owner: true,
    user: req.session.user,
    mode: getRuntimeMode(),
  });
});

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
    .map(buildOwnerGuildPayload)
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

module.exports = router;
