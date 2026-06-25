'use strict';

const express = require('express');
const pollsManager = require('../../modules/polls/pollsManager');

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
    const config = pollsManager.getSection(guildId);
    const polls = Object.values(config.polls || {})
      .map(pollsManager.summarizePoll)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return success(res, {
      guildId,
      config: { ...config, polls },
      overview: {
        enabled: config.enabled !== false,
        total: polls.length,
        active: polls.filter((poll) => poll.status === 'active').length,
        closed: polls.filter((poll) => poll.status === 'closed').length,
        responses: config.analytics?.votes || 0,
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = pollsManager.getSection(guildId);
    config.enabled = req.body?.enabled === true;
    return success(res, { guildId, config: pollsManager.saveSection(guildId, config, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = pollsManager.getSection(guildId);
    config.settings = { ...(config.settings || {}), ...(req.body?.settings || req.body || {}) };
    return success(res, { guildId, config: pollsManager.saveSection(guildId, config, actor(req)) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/polls', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const result = pollsManager.createPoll(guildId, req.body || {}, actor(req));
    return success(res, { guildId, poll: pollsManager.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/polls/:pollId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const result = pollsManager.updatePoll(guildId, req.params.pollId, req.body || {}, actor(req));
    return success(res, { guildId, poll: pollsManager.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/polls/:pollId/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const guild = await getGuild(req, guildId);
    if (!guild) throw new Error('Guild is unavailable.');
    const result = await pollsManager.deployPoll(guild, req.params.pollId, req.body?.channelId, actor(req));
    return success(res, { guildId, poll: pollsManager.summarizePoll(result.poll), messageId: result.messageId, config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/polls/:pollId/status', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const result = pollsManager.setPollStatus(guildId, req.params.pollId, req.body?.status, actor(req));
    return success(res, { guildId, poll: pollsManager.summarizePoll(result.poll), config: result.section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.delete('/:guildId/polls/:pollId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const config = pollsManager.deletePoll(guildId, req.params.pollId, actor(req));
    return success(res, { guildId, config });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
