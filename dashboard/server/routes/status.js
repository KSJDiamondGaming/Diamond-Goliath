const express = require('express');

const router = express.Router();

function getBotProfile(client) {
  const botUser = client?.user || null;

  if (!botUser) {
    return {
      id: null,
      username: 'KSJ Goliath',
      name: 'KSJ Goliath',
      tag: null,
      avatar: null,
      avatarUrl: '',
    };
  }

  let avatarUrl = '';

  try {
    if (typeof botUser.displayAvatarURL === 'function') {
      avatarUrl = botUser.displayAvatarURL({
        extension: 'png',
        size: 256,
        forceStatic: false,
      });
    }
  } catch (error) {
    console.error('Failed to build bot avatar URL:', error);
  }

  return {
    id: botUser.id || null,
    username: botUser.username || 'KSJ Goliath',
    name: botUser.username || 'KSJ Goliath',
    tag: botUser.tag || null,
    avatar: botUser.avatar || null,
    avatarUrl: avatarUrl || '',
  };
}

router.get('/', (req, res) => {
  try {
    const guildId = req.query.guildId || null;
    const client = global.client || null;

    const botReady = Boolean(client?.isReady?.());
    const botLatencyMs =
      typeof client?.ws?.ping === 'number' && Number.isFinite(client.ws.ping)
        ? Math.round(client.ws.ping)
        : null;

    const discordGuild =
      guildId && client?.guilds?.cache
        ? client.guilds.cache.get(String(guildId))
        : null;

    const guildConnected = Boolean(discordGuild);
    const memberCount =
      typeof discordGuild?.memberCount === 'number' ? discordGuild.memberCount : null;

    const botProfile = getBotProfile(client);

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