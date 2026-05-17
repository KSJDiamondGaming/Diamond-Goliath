const fs = require('fs');
const path = require('path');
const express = require('express');

const router = express.Router();

const DISCORD_API = 'https://discord.com/api/v10';

const BOT_PROFILE_CACHE_TTL_MS = 1000 * 60 * 5;
const GUILD_STATS_CACHE_TTL_MS = 15_000;

let cachedBotProfile = null;
let cachedBotProfileExpiresAt = 0;

const guildStatsCache = new Map();

const POSSIBLE_CASE_PATHS = [
  path.join(__dirname, '..', 'data', 'modCaseDetails.json'),
  path.join(process.cwd(), 'src', 'server', 'data', 'modCaseDetails.json'),
  path.join(process.cwd(), 'src', 'data', 'modCaseDetails.json'),
  path.join(process.cwd(), 'data', 'modCaseDetails.json'),
];

function findExistingCasesPath() {
  for (const filePath of POSSIBLE_CASE_PATHS) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return POSSIBLE_CASE_PATHS[0];
}

const CASES_PATH = findExistingCasesPath();

function getClient(req) {
  return req.app.get('client') || req.app.get('discordClient') || null;
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf8');

    if (!raw || !raw.trim()) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.warn(`⚠️ Failed to read JSON file: ${filePath}`);
    console.warn(error.message);

    return fallback;
  }
}

function getBotToken() {
  return String(
    process.env.DISCORD_TOKEN ||
      process.env.TOKEN ||
      process.env.DISCORD_BOT_TOKEN ||
      process.env.BOT_TOKEN ||
      ''
  ).trim();
}

function requireBotToken() {
  const token = getBotToken();

  if (!token) {
    throw new Error(
      'Missing bot token in env. Expected DISCORD_TOKEN, TOKEN, DISCORD_BOT_TOKEN, or BOT_TOKEN.'
    );
  }

  return token;
}

function emptyBotProfile() {
  return {
    id: null,
    username: 'Goliath',
    name: 'Goliath',
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

function getCached(cache, key) {
  const cached = cache.get(key);

  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

function setCached(cache, key, data, ttlMs) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

async function discordBotRequest(pathname) {
  const token = requireBotToken();

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
    name: bot.global_name || bot.username || 'Goliath',
    tag,
    avatar: bot.avatar || null,
    avatarUrl,
    avatarURL: avatarUrl,
    online: true,
    latencyMs: null,
  };

  cachedBotProfileExpiresAt = now + BOT_PROFILE_CACHE_TTL_MS;

  return cachedBotProfile;
}

function getBotProfileFromClient(client) {
  const user = client?.user;

  if (!user) return null;

  const avatarUrl = user.displayAvatarURL?.({ size: 256 }) || '';

  return {
    id: user.id,
    username: user.username || 'Goliath',
    name: user.globalName || user.username || 'Goliath',
    tag: user.tag || user.username || null,
    avatar: user.avatar || null,
    avatarUrl,
    avatarURL: avatarUrl,
    online: Boolean(client?.isReady?.()),
    latencyMs: Number.isFinite(client?.ws?.ping) ? client.ws.ping : null,
  };
}

async function getBotProfile(req) {
  const client = getClient(req);
  const clientProfile = getBotProfileFromClient(client);

  if (clientProfile) {
    return clientProfile;
  }

  return fetchBotProfileFromToken();
}

async function fetchAllGuildMembersFromToken(guildId) {
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

async function getExactMembersFromClient(guild) {
  if (!guild) return [];

  try {
    if (guild.members?.fetch) {
      const fetched = await guild.members.fetch();
      return [...fetched.values()];
    }
  } catch (error) {
    console.warn(
      `Could not fetch members from live client for guild ${guild.id}: ${error.message}`
    );
  }

  if (guild.members?.cache?.size) {
    return [...guild.members.cache.values()];
  }

  return [];
}

function countMembers(members) {
  const total = members.length;
  const bots = members.filter((member) => Boolean(member?.user?.bot)).length;
  const humans = Math.max(total - bots, 0);

  return {
    total,
    humans,
    bots,
    exactMembersAvailable: total > 0,
  };
}

async function fetchGuildStatsFromClient(client, guildId) {
  const guild = client?.guilds?.cache?.get(String(guildId));

  if (!guild) return null;

  const members = await getExactMembersFromClient(guild);
  const counts = countMembers(members);

  const total =
    counts.total ||
    Number(guild.memberCount || guild.approximateMemberCount || 0);

  const humans = counts.exactMembersAvailable ? counts.humans : total;
  const bots = counts.exactMembersAvailable ? counts.bots : 0;

  const iconUrl = guild.iconURL?.({ size: 256 }) || '';

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    memberCount: total,
    members: total,
    humans,
    bots,
    exactMembersAvailable: counts.exactMembersAvailable,
    connected: true,
    status: 'connected',
    source: 'client',
  };
}

async function fetchGuildStatsFromToken(guildId) {
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
    const members = await fetchAllGuildMembersFromToken(guildId);

    if (members.length > 0) {
      const counts = countMembers(members);

      total = counts.total;
      humans = counts.humans;
      bots = counts.bots;
      exactMembersAvailable = true;
    }
  } catch (error) {
    console.warn(
      `Could not fetch exact members for guild ${guildId}; using approximate count. ${error.message}`
    );
  }

  const iconUrl = buildGuildIconUrl(guild.id, guild.icon);

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.icon || null,
    iconUrl,
    iconURL: iconUrl,
    memberCount: total,
    members: total,
    humans,
    bots,
    exactMembersAvailable,
    connected: true,
    status: 'connected',
    source: 'api',
  };
}

async function fetchGuildStats(req, guildId) {
  const cacheKey = `guild:${guildId}`;
  const cached = getCached(guildStatsCache, cacheKey);

  if (cached) {
    return cached;
  }

  const client = getClient(req);

  let data = null;

  try {
    data = await fetchGuildStatsFromClient(client, guildId);
  } catch (error) {
    console.warn(`Live client guild stats failed for ${guildId}: ${error.message}`);
  }

  if (!data) {
    data = await fetchGuildStatsFromToken(guildId);
  }

  setCached(guildStatsCache, cacheKey, data, GUILD_STATS_CACHE_TTL_MS);

  return data;
}

function getCasesData() {
  return readJsonSafe(CASES_PATH, {});
}

function normalizeGuildCases(guildCases, guildId) {
  if (!guildCases) {
    return [];
  }

  if (Array.isArray(guildCases)) {
    return guildCases
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => ({
        ...entry,
        guildId: entry.guildId || guildId,
        caseNumber: entry.caseNumber || entry.case || entry.id || index + 1,
      }))
      .sort((a, b) => Number(b.caseNumber || 0) - Number(a.caseNumber || 0));
  }

  if (typeof guildCases === 'object') {
    return Object.entries(guildCases)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([key, entry]) => ({
        ...entry,
        guildId: entry.guildId || guildId,
        caseNumber: entry.caseNumber || entry.case || entry.id || key,
      }))
      .sort((a, b) => Number(b.caseNumber || 0) - Number(a.caseNumber || 0));
  }

  return [];
}

function getGuildWarningsFromCases(cases) {
  return cases.filter((entry) => {
    const action = String(entry.action || entry.type || '').toLowerCase();

    return action === 'warn' || action === 'warning' || action.includes('warn');
  });
}

function buildGuildFallback(guildId) {
  return {
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
    source: 'fallback',
  };
}

function buildGuildMap(guildId, guildPayload) {
  if (!guildId || !guildPayload) return {};

  return {
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
      source: guildPayload.source,
    },
  };
}

async function buildStatusPayload(req, guildId) {
  let botProfile = emptyBotProfile();
  let botOnline = false;
  let statusError = '';

  try {
    botProfile = await getBotProfile(req);
    botOnline = Boolean(botProfile.online);
  } catch (error) {
    statusError = error.message;
    console.error('Bot status check failed', error);
  }

  let guildPayload = null;

  const memberInfo = {
    total: 0,
    humans: 0,
    bots: 0,
  };

  if (guildId && botOnline) {
    try {
      guildPayload = await fetchGuildStats(req, guildId);

      memberInfo.total = Number(guildPayload.memberCount || 0);
      memberInfo.humans = Number(guildPayload.humans || 0);
      memberInfo.bots = Number(guildPayload.bots || 0);
    } catch (error) {
      statusError = error.message;
      console.error('Guild status fetch failed', error);
      guildPayload = buildGuildFallback(guildId);
    }
  }

  return {
    ok: true,
    status: botOnline ? 'online' : 'offline',

    backendOnline: true,
    apiOnline: true,
    botOnline,

    botLatencyMs: botProfile.latencyMs,
    latencyMs: botProfile.latencyMs,

    guildId: guildId || null,
    guild: guildPayload,

    members: memberInfo.total,
    memberCount: memberInfo.total,
    humans: memberInfo.humans,
    bots: memberInfo.bots,

    guilds: buildGuildMap(guildId, guildPayload),

    bot: {
      ...botProfile,
      online: botOnline,
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
    const payload = await buildStatusPayload(req, guildId);

    return res.json(payload);
  } catch (error) {
    console.error('Status route failed', error);

    return res.status(500).json({
      ok: false,
      status: 'offline',
      backendOnline: true,
      apiOnline: true,
      botOnline: false,
      guildId: req.query.guildId ? String(req.query.guildId) : null,
      guild: null,
      members: 0,
      memberCount: 0,
      humans: 0,
      bots: 0,
      guilds: {},
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
      const statusPayload = await buildStatusPayload(req, guildId);
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

  const intervalId = setInterval(pushSnapshot, 5000);
  const heartbeatId = setInterval(sendHeartbeat, 20000);

  req.on('close', () => {
    closed = true;
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    res.end();
  });
});

module.exports = router;