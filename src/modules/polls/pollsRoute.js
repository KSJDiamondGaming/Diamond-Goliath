'use strict';

const express = require('express');
const polls = require('./polls');
const pollsHealth = require('./pollsHealth');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Community Polls API]', error);
  return res.status(status).json({ success: false, error: error.message || 'Polls API request failed.' });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

function getClient(req) {
  return req.client || req.app?.get?.('goliath.client') || req.app?.locals?.client || global.client || null;
}

async function getGuild(req, guildId) {
  const client = getClient(req);
  if (!client?.guilds) throw new Error('Discord client is unavailable.');
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function actor(req) {
  return { actorId: req.session?.user?.id || req.body?.actorId || null };
}

router.get('/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = polls.getSection(guildId);
    const pollList = Object.values(config.polls || {})
      .map(polls.summarizePoll)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return success(res, {
      guildId,
      config: { ...config, polls: pollList },
      overview: {
        enabled: config.enabled !== false,
        total: pollList.length,
        active: pollList.filter((poll) => poll.status === 'active').length,
        closed: pollList.filter((poll) => poll.status === 'closed').length,
        responses: config.analytics?.votes || 0,
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/health', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    return success(res, { guildId, health: await pollsHealth.buildHealth(guild) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/export', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, { guildId, export: pollsHealth.exportConfig(guildId) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = polls.getSection(guildId);
    config.enabled = req.body?.enabled === true;
    return success(res, { guildId, config: polls.saveSection(guildId, config, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = polls.getSection(guildId);
    config.settings = { ...(config.settings || {}), ...(req.body?.settings || req.body || {}) };
    return success(res, { guildId, config: polls.saveSection(guildId, config, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/repair', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    return success(res, { guildId, result: await pollsHealth.repair(guild, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/reset', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    return success(res, { guildId, result: await pollsHealth.reset(guild, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/polls', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const result = polls.createPoll(guildId, req.body || {}, actor(req));
    return success(res, { guildId, poll: polls.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/polls/:pollId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const result = polls.updatePoll(guildId, req.params.pollId, req.body || {}, actor(req));
    return success(res, { guildId, poll: polls.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/polls/:pollId/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const result = await polls.deployPoll(guild, req.params.pollId, req.body?.channelId, actor(req));
    return success(res, {
      guildId,
      poll: polls.summarizePoll(result.poll),
      messageId: result.messageId,
      redeployed: result.redeployed,
      config: result.section,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/polls/:pollId/status', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const result = await polls.setPollStatus(guild, req.params.pollId, req.body?.status, actor(req));
    return success(res, { guildId, poll: polls.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/polls/:pollId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const config = await polls.deletePoll(guild, req.params.pollId, actor(req));
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
