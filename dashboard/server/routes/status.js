const express = require('express');
const path = require('path');

const router = express.Router();

const terminal = require('../../../src/utils/utility/terminalLogger').createLogger('api');
const client = require('../../../index.js');
const { read: readJson } = require('../utils/fileStore');

const CASES_PATH = path.join(__dirname, '..', 'data', 'modCaseDetails.json');
const DISCORD_API = 'https://discord.com/api/v10';

let cachedBotProfile = null;
let cachedBotProfileExpiresAt = 0;

function emptyBotProfile() {
  return {
    id: null,
    username: 'KSJ Goliath',
    name: 'KSJ Goliath',
    tag: null,
    avatar: null,
    avatarUrl: '',
    avatarURL: '',
    online: false,
    latencyMs: null,
  };
}

function getCasesData() {
  return readJson(CASES_PATH, {});
}

function buildDiscordAvatarUrl(id, avatar) {
  if (!id || !avatar) return '';

  const ext = String(avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

async function fetchBotProfileFromToken() {
  const token = process.env.TOKEN || process.env.DISCORD_BOT_TOKEN || '';

  if (!token) return null;

  const now = Date.now();

  if (cachedBotProfile && now < cachedBotProfileExpiresAt) {
    return cachedBotProfile;
  }

  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: `Bot ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bot profile fetch failed ${response.status}: ${text}`);
  }

  const bot = await response.json();

  const avatarUrl = buildDiscordAvatarUrl(bot.id, bot.avatar);

  cachedBotProfile = {
    id: bot.id,
    username: bot.username,
    name: bot.username || 'KSJ Goliath',
    tag: bot.discriminator ? `${bot.username}#${bot.discriminator}` : bot.username,
    avatar: bot.avatar || null,
    avatarUrl,
    avatarURL: avatarUrl,
  };

  cachedBotProfileExpiresAt = now + 1000 * 60 * 5;

  return cachedBotProfile;
}

async function buildBotProfile(ready, botLatencyMs) {
  if (client?.user) {
    const avatarUrl = client.user.displayAvatarURL({
      extension: 'png',
      size: 256,
      forceStatic: false,
    });

    return {
      id: client.user.id,
      username: client.user.username,
      name: client.user.username,
      tag: client.user.tag ?? null,
      avatar: client.user.avatar ?? null,
      avatarUrl,
      avatarURL: avatarUrl,
      online: ready,
      latencyMs: botLatencyMs,
    };
  }

  try {
    const tokenProfile = await fetchBotProfileFromToken();

    if (tokenProfile) {
      return {
        ...tokenProfile,
        online: ready,
        latencyMs: botLatencyMs,
      };
    }
  } catch (error) {
    terminal.error('Failed to fetch bot profile from token', error);
  }

  return emptyBotProfile();
}

function normalizeGuildCases(guildCases, guildId) {
  if (!guildCases || typeof guildCases !== 'object') return [];

  return Object.values(guildCases)
    .map((entry) => ({
      ...entry,
      guildId: entry?.guildId || guildId,
    }))
    .sort((a, b) => Number(b?.caseNumber || 0) - Number(a?.caseNumber || 0));
}

function getGuildWarningsFromCases(cases) {
  return cases.filter((entry) => entry?.action === 'Warn');
}

async function resolveGuild(guildId) {
  if (!guildId || !client?.guilds) return null;

  return (
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null))
  );
}

async function buildStatusPayload(guildId) {
  const ready = Boolean(client?.isReady?.());

  const botLatencyMs =
    ready && typeof client.ws?.ping === 'number'
      ? Math.round(client.ws.ping)
      : null;

  let guildPayload = null;
  let memberInfo = {
    total: null,
    humans: null,
    bots: null,
  };

  if (guildId) {
    const guild = await resolveGuild(guildId);

    if (guild) {
      await guild.members.fetch().catch(() => null);

      const members = guild.members.cache;

      memberInfo = {
        total: Number(guild.memberCount ?? members.size ?? 0),
        humans: members.filter((member) => !member.user?.bot).size,
        bots: members.filter((member) => Boolean(member.user?.bot)).size,
      };

      guildPayload = {
        id: guild.id,
        name: guild.name,
        icon: guild.icon || null,
        memberCount: memberInfo.total,
        humans: memberInfo.humans,
        bots: memberInfo.bots,
        connected: true,
        status: 'connected',
      };
    }
  }

  const botProfile = await buildBotProfile(ready, botLatencyMs);

  return {
    ok: true,
    status: ready ? 'online' : 'offline',
    backendOnline: true,
    apiOnline: true,
    botOnline: ready,
    botLatencyMs,
    latencyMs: botLatencyMs,
    guildId: guildId || null,
    guild: guildPayload,
    members: memberInfo.total,
    humans: memberInfo.humans,
    bots: memberInfo.bots,
    guilds: {},
    bot: botProfile,
    backend: {
      online: true,
      status: 'healthy',
    },
    api: {
      online: true,
      status: 'healthy',
    },
    timestamp: new Date().toISOString(),
  };
}

function buildGuildSnapshot(guildId, statusPayload) {
  const casesData = getCasesData();
  const guildCases = normalizeGuildCases(casesData[guildId] || {}, guildId);
  const guildWarnings = getGuildWarningsFromCases(guildCases);

  return {
    guildId,
    status: statusPayload,
    cases: guildCases,
    warnings: guildWarnings,
    timestamp: new Date().toISOString(),
  };
}

router.get('/', async (req, res) => {
  try {
    const guildId = req.query.guildId ? String(req.query.guildId) : null;
    const payload = await buildStatusPayload(guildId);
    return res.json(payload);
  } catch (error) {
    terminal.error('Status route failed', error);

    return res.status(500).json({
      ok: false,
      status: 'offline',
      error: 'Failed to load status.',
    });
  }
});

router.get('/stream', async (req, res) => {
  const guildId = req.query.guildId ? String(req.query.guildId) : '';

  if (!guildId) {
    return res.status(400).json({ error: 'Guild ID is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let closed = false;
  let intervalId = null;
  let heartbeatId = null;

  const sendEvent = (eventName, payload) => {
    if (closed) return;
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const sendHeartbeat = () => {
    if (closed) return;
    res.write(`: heartbeat ${Date.now()}\n\n`);
  };

  const pushSnapshot = async () => {
    try {
      const statusPayload = await buildStatusPayload(guildId);
      const snapshot = buildGuildSnapshot(guildId, statusPayload);

      sendEvent('status', snapshot.status);
      sendEvent('cases', snapshot.cases);
      sendEvent('warnings', snapshot.warnings);
      sendEvent('snapshot', snapshot);
    } catch (error) {
      console.error('SSE status stream failed:', error);
      sendEvent('status', {
        ok: false,
        guildId,
        error: 'Failed to refresh live status.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  await pushSnapshot();

  intervalId = setInterval(pushSnapshot, 5000);
  heartbeatId = setInterval(sendHeartbeat, 20000);

  req.on('close', () => {
    closed = true;
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    res.end();
  });
});

module.exports = router;