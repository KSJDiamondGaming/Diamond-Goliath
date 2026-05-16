const express = require('express');
const guildManager = require('../../../guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    const welcome = guildManager.getGuildSection(guildId, 'welcome', {});
    const leave = guildManager.getGuildSection(guildId, 'leave', {});

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (error) {
    console.error('Messages load failed:', error);
    return res.status(500).json({ error: 'Failed to load message config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    const welcome = guildManager.saveGuildSection(guildId, 'welcome', {
      title: body.welcomeTitle || '',
      message: body.welcomeMessage || '',
      channelId: body.welcomeChannelId || null,
    });

    const leave = guildManager.saveGuildSection(guildId, 'leave', {
      title: body.leaveTitle || '',
      message: body.leaveMessage || '',
      channelId: body.leaveChannelId || null,
    });

    emitGuildUpdate(guildId, { section: 'welcome', data: welcome });
    emitGuildUpdate(guildId, { section: 'leave', data: leave });

    return res.json({ ok: true, guildId, welcome, leave });
  } catch (error) {
    console.error('Messages save failed:', error);
    return res.status(500).json({ error: 'Failed to save message config.' });
  }
});

module.exports = router;
