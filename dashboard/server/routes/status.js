const express = require('express');

const router = express.Router();

const terminal = require('../../../src/core/logs/terminalLogger').createLogger('api');
const guildStore = require('../../../src/core/guild/store');

const DISCORD_API = 'https://discord.com/api/v10';

const BOT_PROFILE_CACHE_TTL = 1000 * 60 * 5;
const GUILD_STATS_CACHE_TTL = 15_000;

let cachedBotProfile = null;
let cachedBotProfileExpiresAt = 0;

const guildStatsCache = new Map();

function getBotToken() {
  return String(process.env.TOKEN || process.env.DISCORD_BOT_TOKEN || '').trim();
}

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

function buildDiscordAvatarUrl(id, avatar) {
  if (!id || !avatar) return '';

  const ext = String(avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=256`;
}

function buildGuildIconUrl(id, icon) {
  if (!id || !icon) return '';

  const ext = String(icon).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=256`;
}

async function discordBotRequest(pathname) {
  const token = getBotToken();

  if (!token) {
    throw new Error('Missing TOKEN or DISCORD_BOT_TOKEN in env');
  }

  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: {
      Authorization: `Bot ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Discord API failed ${response.status} ${response.statusText}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`
    );
  }

  return data;
}

async function fetchBotProfileFromToken() {
  const now = Date.now();

  if (cachedBotProfile && now < cachedBotProfileExpiresAt) {
    return cachedBotProfile;
  }

  const bot = await discordBotRequest('/users/@me');
  const avatarUrl = buildDiscordAvatarUrl(bot.id, bot.avatar);

  const tag =
    bot.discriminator && bot.discriminator !== '0'
      ? `${bot.username}#${bot.discriminator}`
      : bot.username;

  cachedBotProfile = {
    id: bot.id,
    username: bot.username,
    name: bot.global_name || bot.username || 'KSJ Goliath',
    tag,
    avatar: bot.avatar || null,
    avatarUrl,
    avatarURL: avatarUrl,
    online: true,
    latencyMs: null,
  };

  cachedBotProfileExpiresAt = now + BOT_PROFILE_CACHE_TTL;

  return cachedBotProfile;
}

async function fetchAllGuildMembers(guildId) {
  const members = [];
  let after = '0';

  for (let page = 0; page < 20; page += 1) {
    const batch = await discordBotRequest(
      `/guilds/${guildId}/members?limit=1000&after=${after}`
    );

    if (!Array.isArray(batch) || batch.length === 0) break;

    members.push(...batch);

    if (batch.length < 1000) break;

    after = batch[batch.length - 1]?.user?.id || after;
  }

  return members;
}

async function fetchGuildStats(guildId) {
  const cached = guildStatsCache.get(guildId);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const guild = await discordBotRequest(`/guilds/${guildId}?with_counts=true`);

  let total = Number(
    guild.approximate_member_count ||
      guild.member_count ||
      guild.memberCount ||
      0
  );

  let humans = total;
  let bots = 0;
  let exactMembersAvailable = false;

  try {
    const members = await fetchAllGuildMembers(guildId);

    if (members.length > 0) {
      exactMembersAvailable = true;
      total = members.length;
      bots = members.filter((member) => Boolean(member?.user?.bot)).length;
      humans = members.filter((member) => !member?.user?.bot).length;
    }
  } catch (error) {
    terminal.warn(
      `Could not fetch exact members for guild ${guildId}; using approximate count. ${error.message}`
    );
  }

  const data = {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl: buildGuildIconUrl(guild.id, guild.icon),
    iconURL: buildGuildIconUrl(guild.id, guild.icon),
    memberCount: total,
    members: total,
    humans,
    bots,
    exactMembersAvailable,
    connected: true,
    status: 'connected',
  };

  guildStatsCache.set(guildId, {
    data,
    expiresAt: Date.now() + GUILD_STATS_CACHE_TTL,
  });

  return data;
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

async function buildStatusPayload(guildId) {
  let botProfile = emptyBotProfile();
  let botOnline = false;
  let statusError = '';

  try {
    botProfile = await fetchBotProfileFromToken();
    botOnline = true;
  } catch (error) {
    statusError = error.message;
    terminal.error('Bot token status check failed', error);
  }

  let guildPayload = null;

  let memberInfo = {
    total: 0,
    humans: 0,
    bots: 0,
  };

  if (guildId && botOnline) {
    try {
      guildPayload = await fetchGuildStats(guildId);

      memberInfo = {
        total: Number(guildPayload.memberCount || 0),
        humans: Number(guildPayload.humans || 0),
        bots: Number(guildPayload.bots || 0),
      };
    } catch (error) {
      statusError = error.message;
      terminal.error('Guild status fetch failed', error);

      guildPayload = {
        id: guildId,
        name: null,
        icon: null,
        iconUrl: '',
        iconURL: '',
        memberCount: 0,
        members: 0,
        humans: 0,
        bots: 0,
        exactMembersAvailable: false,
        connected: false,
        status: 'missing',
      };
    }
  }

  return {
    ok: true,
    status: botOnline ? 'online' : 'offline',

    backendOnline: true,
    apiOnline: true,
    botOnline,

    botLatencyMs: null,
    latencyMs: null,

    guildId: guildId || null,
    guild: guildPayload,

    members: memberInfo.total,
    memberCount: memberInfo.total,
    humans: memberInfo.humans,
    bots: memberInfo.bots,

    guilds:
      guildId && guildPayload
        ? {
            [guildId]: {
              connected: guildPayload.connected,
              status: guildPayload.status,
              memberCount: guildPayload.memberCount,
              members: guildPayload.memberCount,
              humans: guildPayload.humans,
              bots: guildPayload.bots,
              name: guildPayload.name,
              id: guildPayload.id,
              icon: guildPayload.icon,
              iconUrl: guildPayload.iconUrl,
              iconURL: guildPayload.iconURL,
              exactMembersAvailable: guildPayload.exactMembersAvailable,
            },
          }
        : {},

    bot: {
      ...botProfile,
      online: botOnline,
      latencyMs: null,
    },

    backend: {
      online: true,
      status: 'healthy',
    },

    api: {
      online: true,
      status: 'healthy',
    },

    error: statusError || null,
    timestamp: new Date().toISOString(),
  };
}

function buildGuildSnapshot(guildId, statusPayload) {
  const casesData = guildStore.getGuildSection(guildId, 'cases', {});
  const guildCases = normalizeGuildCases(casesData, guildId);
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
      backendOnline: true,
      apiOnline: true,
      botOnline: false,
      guildId: req.query.guildId ? String(req.query.guildId) : null,
      guild: null,
      members: 0,
      humans: 0,
      bots: 0,
      bot: emptyBotProfile(),
      backend: {
        online: true,
        status: 'healthy',
      },
      api: {
        online: true,
        status: 'healthy',
      },
      error: error.message || 'Failed to load status.',
      timestamp: new Date().toISOString(),
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
        error: error.message || 'Failed to refresh live status.',
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