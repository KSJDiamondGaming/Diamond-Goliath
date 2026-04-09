const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3002';

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

router.get('/guilds', async (req, res) => {
  try {
    const accessToken =
      req.session?.accessToken ||
      req.session?.discordAccessToken ||
      req.session?.token;

    if (!accessToken) {
      console.log('❌ No access token in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('✅ Fetching user guilds from Discord OAuth...');

    const userGuilds = await discordRequest(
      `${DISCORD_API}/users/@me/guilds`,
      accessToken
    );

    console.log(`👤 User guilds found: ${userGuilds.length}`);

    console.log(`🤖 Fetching bot guilds from ${BOT_API_URL}/internal/guilds ...`);

    const botGuilds = await fetchJson(`${BOT_API_URL}/internal/guilds`);

    console.log(`🤖 Bot guilds found: ${botGuilds.length}`);
    console.log(
      '🤖 Bot guild IDs:',
      botGuilds.map((guild) => guild.id)
    );

    const botGuildIds = new Set(botGuilds.map((guild) => guild.id));

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

    console.log(`✅ Mutual guilds found: ${mutualGuilds.length}`);
    console.log(
      '✅ Mutual guild names:',
      mutualGuilds.map((guild) => guild.name)
    );

    return res.json(mutualGuilds);
  } catch (error) {
    console.error('❌ Failed to fetch guilds:', error);
    return res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

module.exports = router;