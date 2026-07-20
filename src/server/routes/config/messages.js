const express = require('express');

const guildManager = require('../../../core/guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChannelId(value) {
  const channelId = typeof value === 'string' ? value.trim() : '';

  return channelId || null;
}

function buildMessageConfig(body, type) {
  return {
    enabled: Boolean(body[`${type}Enabled`]),
    title: normalizeText(body[`${type}Title`]),
    message: normalizeText(body[`${type}Message`]),
    channelId: normalizeChannelId(body[`${type}ChannelId`]),
  };
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guild ID.',
      });
    }

    const welcome = guildManager.getGuildSection(guildId, 'welcome', {});
    const leave = guildManager.getGuildSection(guildId, 'leave', {});

    return res.json({
      ok: true,
      guildId,
      welcome,
      leave,
    });
  } catch (error) {
    console.error('Messages load failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to load message config.',
      message: error.message,
    });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    if (!guildId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing guild ID.',
      });
    }

    const welcomePayload = buildMessageConfig(body, 'welcome');
    const leavePayload = buildMessageConfig(body, 'leave');

    const welcome = guildManager.saveGuildSection(
      guildId,
      'welcome',
      welcomePayload
    );

    const leave = guildManager.saveGuildSection(
      guildId,
      'leave',
      leavePayload
    );

    emitGuildUpdate(guildId, {
      section: 'welcome',
      data: welcome,
    });

    emitGuildUpdate(guildId, {
      section: 'leave',
      data: leave,
    });

    return res.json({
      ok: true,
      guildId,
      welcome,
      leave,
    });
  } catch (error) {
    console.error('Messages save failed:', error);

    return res.status(500).json({
      ok: false,
      error: 'Failed to save message config.',
      message: error.message,
    });
  }
});

module.exports = router;
