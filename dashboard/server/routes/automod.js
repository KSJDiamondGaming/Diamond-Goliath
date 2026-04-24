const express = require('express');

const {
  getGuildAutoModConfig,
  saveGuildAutoModConfig,
} = require('../utils/automodStore');

const router = express.Router();

router.get('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({ error: 'Guild ID is required.' });
    }

    const config = getGuildAutoModConfig(guildId);
    return res.json(config);
  } catch (error) {
    console.error('Failed to get automod config:', error);
    return res.status(500).json({ error: 'Failed to load automod config.' });
  }
});

router.post('/:guildId', (req, res) => {
  try {
    const { guildId } = req.params;

    if (!guildId) {
      return res.status(400).json({ error: 'Guild ID is required.' });
    }

    const saved = saveGuildAutoModConfig(guildId, req.body || {});

    return res.json({
      success: true,
      config: saved,
    });
  } catch (error) {
    console.error('Failed to save automod config:', error);
    return res.status(500).json({ error: 'Failed to save automod config.' });
  }
});

module.exports = router;