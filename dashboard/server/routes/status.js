const express = require('express');
const router = express.Router();

const terminal = require('../../../src/utils/utility/terminalLogger').createLogger('api');

// 👇 DIRECT BOT ACCESS (no more BOT_API_URL)
const client = require('../../../index.js');

const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true';

/* ---------------- HELPERS ---------------- */

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

/* ---------------- STATUS ROUTE ---------------- */

router.get('/', async (req, res) => {
  try {
    const guildId = req.query.guildId ? String(req.query.guildId) : null;

    const ready = client.isReady();

    const botLatencyMs =
      ready && typeof client.ws?.ping === 'number'
        ? Math.round(client.ws.ping)
        : null;

    let memberInfo = null;

    if (guildId) {
      const guild = client.guilds.cache.get(guildId);

      if (guild) {
        const members = guild.members.cache;

        memberInfo = {
          total: guild.memberCount ?? null,
          humans: members.filter((m) => !m.user.bot).size,
          bots: members.filter((m) => m.user.bot).size,
        };
      }
    }

    const botProfile = client.user
      ? {
          id: client.user.id,
          username: client.user.username,
          name: client.user.username,
          tag: client.user.tag ?? null,
          avatar: client.user.avatar ?? null,
          avatarUrl: client.user.displayAvatarURL({ dynamic: true }),
        }
      : emptyBotProfile();

    const guildConnected = guildId
      ? Boolean(client.guilds.cache.get(guildId))
      : false;

    return res.json({
      ok: true,
      status: ready ? 'online' : 'offline',

      backendOnline: true,
      apiOnline: true,
      botOnline: ready,

      botLatencyMs,

      guilds: guildId
        ? {
            [guildId]: {
              connected: guildConnected,
              status: guildConnected ? 'connected' : 'missing',
              memberCount: memberInfo?.total ?? null,
              humans: memberInfo?.humans ?? null,
              bots: memberInfo?.bots ?? null,
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
        online: ready,
        latencyMs: botLatencyMs,
      },

      api: {
        online: true,
        status: 'healthy',
      },

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    terminal.error('Status route failed', error);

    return res.status(500).json({
      ok: false,
      status: 'offline',
      error: 'Failed to load status.',
    });
  }
});

module.exports = router;