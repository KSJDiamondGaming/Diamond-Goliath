const express = require('express');
const guildManager = require('../../services/guild/guildManager');
const { emitGuildUpdate } = require('../../sockets/socketHub');

const router = express.Router();

function getBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const config = guildManager.getGuildSection(guildId, 'embeds', {});

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Embeds load failed:', error);
    return res.status(500).json({ error: 'Failed to load embed config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;
    const body = getBody(req);

    const config = guildManager.saveGuildSection(guildId, 'embeds', {
      defaultTitle: body.defaultTitle || '',
      footerText: body.footerText || '',
      footerIcon: body.footerIcon || '',
      color: body.color || '',
    });

    emitGuildUpdate(guildId, {
      section: 'embeds',
      data: config,
    });

    return res.json({ ok: true, guildId, config });
  } catch (error) {
    console.error('Embeds save failed:', error);
    return res.status(500).json({ error: 'Failed to save embed config.' });
  }
});

module.exports = router;