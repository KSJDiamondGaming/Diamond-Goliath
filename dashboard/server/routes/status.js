const express = require('express');
const path = require('path');

const router = express.Router();

const terminal = require('../../../src/utils/utility/terminalLogger').createLogger('api');
const client = require('../../../index.js');
const { read, write } = require('../utils/fileStore');

const CASES_PATH = path.join(__dirname, '..', 'data', 'modCaseDetails.json');

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

function getCasesData() {
  return readJson(CASES_PATH, {});
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
  const ready = client.isReady();

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
    } else {
      guildPayload = {
        id: guildId,
        name: null,
        icon: null,
        memberCount: 0,
        humans: 0,
        bots: 0,
        connected: false,
        status: 'missing',
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

    guilds:
      guildId && guildPayload
        ? {
            [guildId]: {
              connected: guildPayload.connected,
              status: guildPayload.status,
              memberCount: guildPayload.memberCount,
              humans: guildPayload.humans,
              bots: guildPayload.bots,
              name: guildPayload.name,
              id: guildPayload.id,
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
  const heartbeatId = setInterval(sendHeartbeat, 20000);

  req.on('close', () => {
    closed = true;
    clearInterval(intervalId);
    clearInterval(heartbeatId);
    res.end();
  });
});

module.exports = router;