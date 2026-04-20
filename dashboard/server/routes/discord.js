const fetch = global.fetch || require('node-fetch');
const express = require('express');
const router = express.Router();

// 👇 DIRECT BOT ACCESS (no more BOT_API_URL)
const client = require('../../../index.js');

const DISCORD_API = 'https://discord.com/api/v10';

/* ---------------- HELPERS ---------------- */

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);

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
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

/* ---------------- GET USER GUILDS ---------------- */

router.get('/guilds', async (req, res) => {
  try {
    const accessToken =
      req.session?.accessToken ||
      req.session?.discordAccessToken ||
      req.session?.access_token ||
      req.session?.token;

    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // 1. USER guilds
    const userGuilds = await discordRequest(
      `${DISCORD_API}/users/@me/guilds`,
      accessToken
    );

    // 2. BOT guilds (direct from client)
    const botGuildIds = new Set(
      client.guilds.cache.map((g) => g.id)
    );

    // 3. Filter mutual
    const mutualGuilds = userGuilds
      .filter((guild) => botGuildIds.has(guild.id))
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconURL: buildGuildIconUrl(guild),
        owner: guild.owner,
        permissions: guild.permissions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json(mutualGuilds);
  } catch (error) {
    console.error('❌ Failed to fetch guilds:', error);
    return res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

/* ---------------- GET CHANNELS ---------------- */

router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channels = guild.channels.cache
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position ?? 0,
      }))
      .sort((a, b) => {
        const posDiff = a.position - b.position;
        if (posDiff !== 0) return posDiff;
        return a.name.localeCompare(b.name);
      });

    return res.json(channels);
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
});

module.exports = router;