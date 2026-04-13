const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3002';

// --------------------
// Helpers
// --------------------
async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status}: ${text}`);
  }

  return response.json();
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

// --------------------
// GET USER GUILDS
// --------------------
router.get('/guilds', async (req, res) => {
  try {
    const accessToken =
      req.session?.accessToken ||
      req.session?.discordAccessToken ||
      req.session?.access_token || // 👈 added
      req.session?.token;

    if (!accessToken) {
      console.log('❌ No access token in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('🔑 Access token found');

    // --------------------
    // 1. Fetch USER guilds
    // --------------------
    const userGuilds = await discordRequest(
      `${DISCORD_API}/users/@me/guilds`,
      accessToken
    );

    console.log(`👤 User guilds: ${userGuilds.length}`);

    // --------------------
    // 2. Fetch BOT guilds
    // --------------------
    let botGuilds = [];

    try {
      console.log(`🤖 Fetching bot guilds from ${BOT_API_URL}/internal/guilds`);

      botGuilds = await fetchJson(
        `${BOT_API_URL}/internal/guilds`
      );

      console.log(`🤖 Bot guilds: ${botGuilds.length}`);
    } catch (err) {
      console.warn('⚠️ Bot API failed, showing ALL user guilds instead');
    }

    // --------------------
    // 3. If bot API failed → fallback
    // --------------------
    if (!botGuilds.length) {
      const fallback = userGuilds.map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconURL: buildGuildIconUrl(guild),
        owner: guild.owner,
        permissions: guild.permissions,
      }));

      console.log(`⚠️ Fallback guilds returned: ${fallback.length}`);
      return res.json(fallback);
    }

    // --------------------
    // 4. Filter mutual guilds
    // --------------------
    const botGuildIds = new Set(botGuilds.map((g) => g.id));

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

    console.log(`✅ Mutual guilds: ${mutualGuilds.length}`);

    return res.json(mutualGuilds);
  } catch (error) {
    console.error('❌ Failed to fetch guilds:', error);
    return res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// --------------------
// GET CHANNELS
// --------------------
router.get('/guilds/:guildId/channels', async (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({ error: 'Guild ID is required' });
    }

    console.log(`📡 Fetching channels for ${guildId}`);

    const channels = await fetchJson(
      `${BOT_API_URL}/internal/guilds/${guildId}/channels`
    );

    const filtered = (Array.isArray(channels) ? channels : [])
      .filter((c) => c.type === 0 || c.type === 5)
      .sort((a, b) => {
        const posDiff = (a.position ?? 0) - (b.position ?? 0);
        if (posDiff !== 0) return posDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position ?? 0,
      }));

    return res.json(filtered);
  } catch (error) {
    console.error('❌ Failed to fetch guild channels:', error);
    return res.status(500).json({ error: 'Failed to fetch guild channels' });
  }
});

module.exports = router;