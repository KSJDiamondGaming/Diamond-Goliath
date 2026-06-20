'use strict';

// src/server/routes/discordResources.js

const express = require('express');

const {
  getDiscordResources,
  syncDiscordResources,
} = require('../../guild/discordResourceManager');

const router = express.Router();

function getDiscordClient(req) {
  return (
    req.app?.locals?.client ||
    req.app?.locals?.discordClient ||
    global.client ||
    global.discordClient ||
    null
  );
}

function isAuthenticated(req) {
  return Boolean(req.session?.user);
}

async function fetchGuild(req, guildId) {
  const client = getDiscordClient(req);

  if (!client?.guilds) {
    throw new Error('Discord client unavailable');
  }

  const cachedGuild = client.guilds.cache?.get(String(guildId));
  if (cachedGuild) return cachedGuild;

  if (typeof client.guilds.fetch !== 'function') {
    throw new Error('Discord guild fetch unavailable');
  }

  return client.guilds.fetch(String(guildId));
}

router.get('/:guildId/resources', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const resources = getDiscordResources(req.params.guildId);
    return res.json(resources);
  } catch (error) {
    console.error('❌ Failed to read Discord resources:', error);
    return res.status(500).json({ error: 'Failed to read Discord resources' });
  }
});

router.post('/:guildId/resources/sync', async (req, res) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const guild = await fetchGuild(req, req.params.guildId);

    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const resources = await syncDiscordResources(guild);
    return res.json(resources);
  } catch (error) {
    console.error('❌ Failed to sync Discord resources:', error);
    return res.status(500).json({ error: 'Failed to sync Discord resources' });
  }
});

module.exports = router;
