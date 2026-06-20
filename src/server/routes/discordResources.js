'use strict';

const express = require('express');
const { getDiscordResources, syncDiscordResources } = require('../../guild/discordResourceManager');

const router = express.Router();

function getDiscordClient(req) {
  return req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient || null;
}

function isAuthenticated(req) {
  return Boolean(req.session?.user);
}

function readCache(guildId, extra = {}) {
  return { ...getDiscordResources(guildId), ...extra };
}

function readList(guildId, key) {
  const resources = readCache(guildId);
  return Array.isArray(resources[key]) ? resources[key] : [];
}

async function fetchGuild(req, guildId) {
  const client = getDiscordClient(req);
  if (!client?.guilds) return null;

  const cachedGuild = client.guilds.cache?.get(String(guildId));
  if (cachedGuild) return cachedGuild;

  if (client.isReady && !client.isReady()) return null;
  if (typeof client.guilds.fetch !== 'function') return null;

  return client.guilds.fetch(String(guildId)).catch(() => null);
}

router.get('/:guildId/resources', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
    return res.json(readCache(req.params.guildId));
  } catch (error) {
    console.error('Failed to read Discord resources:', error);
    return res.json({ lastSync: null, guild: null, channels: [], categories: [], roles: [], emojis: [], warning: 'Resource cache unavailable' });
  }
});

router.get('/:guildId/channels', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(readList(req.params.guildId, 'channels'));
});

router.get('/:guildId/categories', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(readList(req.params.guildId, 'categories'));
});

router.get('/:guildId/roles', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(readList(req.params.guildId, 'roles'));
});

router.get('/:guildId/emojis', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(readList(req.params.guildId, 'emojis'));
});

router.post('/:guildId/resources/sync', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not authenticated' });

    const guild = await fetchGuild(req, req.params.guildId);
    if (!guild) {
      return res.json(readCache(req.params.guildId, { warning: 'Discord client or guild unavailable. Returned cached resources.' }));
    }

    const resources = await syncDiscordResources(guild);
    return res.json(resources);
  } catch (error) {
    console.error('Failed to sync Discord resources:', error);
    return res.json(readCache(req.params.guildId, { warning: 'Live Discord sync failed. Returned cached resources.' }));
  }
});

module.exports = router;
