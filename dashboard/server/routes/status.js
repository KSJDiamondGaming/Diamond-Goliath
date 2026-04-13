const express = require('express');

const router = express.Router();

const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:3002';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed ${response.status}: ${text}`);
  }

  return response.json();
}

function emptyBotProfile() {
  return {
    id: null,
    username: 'KSJ Goliath',
    name: 'KSJ Goliath',
    tag: null,
    avatar: null,
    avatarUrl: '',
  };
}

router.get('/', async (req, res) => {
  try {
    const guildId = req.query.guildId ? String(req.query.guildId) : null;

    let botStatus = null;
    let memberInfo = null;

    try {
      botStatus = await fetchJson(`${BOT_API_URL}/internal/status`);
    } catch (error) {
      console.error('Failed to reach bot status endpoint:', error.message);
    }

    if (guildId) {
      try {
        memberInfo = await fetchJson(
          `${BOT_API_URL}/internal/guilds/${guildId}/members/count`
        );
      } catch (error) {
        console.error('Failed to reach member count endpoint:', error.message);
      }
    }

    const botReady = Boolean(botStatus?.online);
    const botLatencyMs =
      typeof botStatus?.ping === 'number' && Number.isFinite(botStatus.ping)
        ? Math.round(botStatus.ping)
        : null;

    const guildConnected = guildId ? Boolean(memberInfo) : false;
    const memberCount =
      typeof memberInfo?.total === 'number' ? memberInfo.total : null;

    const botProfile = botStatus?.user
      ? {
          id: botStatus.user.id || null,
          username: botStatus.user.username || 'KSJ Goliath',
          name: botStatus.user.username || 'KSJ Goliath',
          tag: botStatus.user.tag || null,
          avatar: botStatus.user.avatar || null,
          avatarUrl: botStatus.user.avatarUrl || '',
        }
      : emptyBotProfile();

    return res.json({
      ok: true,
      status: botReady ? 'online' : 'offline',
      backendOnline: true,
      apiOnline: true,
      botOnline: botReady,
      botLatencyMs,
      guilds: guildId
        ? {
            [guildId]: {
              connected: guildConnected,
              inGuild: guildConnected,
              available: guildConnected,
              online: guildConnected,
              status: guildConnected ? 'connected' : 'missing',
              memberCount,
              humans:
                typeof memberInfo?.humans === 'number' ? memberInfo.humans : null,
              bots:
                typeof memberInfo?.bots === 'number' ? memberInfo.bots : null,
            },
          }
        : {},
      bot: {
        id: botProfile.id,
        username: botProfile.username,
        name: botProfile.name,
        tag: botProfile.tag,
        avatar: botProfile.avatar,
        avatarUrl: botProfile.avatarUrl,
        online: botReady,
        connected: botReady,
        latencyMs: botLatencyMs,
        guilds: guildId
          ? {
              [guildId]: {
                connected: guildConnected,
                inGuild: guildConnected,
                available: guildConnected,
                online: guildConnected,
                status: guildConnected ? 'connected' : 'missing',
                memberCount,
                humans:
                  typeof memberInfo?.humans === 'number'
                    ? memberInfo.humans
                    : null,
                bots:
                  typeof memberInfo?.bots === 'number' ? memberInfo.bots : null,
              },
            }
          : {},
      },
      api: {
        online: true,
        healthy: true,
        status: 'healthy',
      },
      backend: {
        online: true,
        ok: true,
        status: 'online',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to load status:', error);
    return res.status(500).json({
      ok: false,
      status: 'offline',
      backendOnline: false,
      apiOnline: false,
      botOnline: false,
      botLatencyMs: null,
      error: 'Failed to load status.',
    });
  }
});

module.exports = router;