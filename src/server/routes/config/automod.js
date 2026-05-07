const express = require('express');
const guildManager = require('../../../guild/guildManager')
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const config = guildManager.getGuildSection(guildId, 'automod', {});

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('AutoMod load failed:', error);
    return res.status(500).json({ error: 'Failed to load automod config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    const config = guildManager.saveGuildSection(guildId, 'automod', body);

    emitGuildUpdate(guildId, {
      section: 'automod',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('AutoMod save failed:', error);
    return res.status(500).json({ error: 'Failed to save automod config.' });
  }
});

module.exports = router;