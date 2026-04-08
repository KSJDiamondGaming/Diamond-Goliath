const express = require('express');
const path = require('path');
const readJson = require('../utils/readJson');

const router = express.Router();

const DATA_PATH = path.join(__dirname, '..', '..', '..', 'src', 'data');
const GUILDS_FILE = path.join(DATA_PATH, 'guilds.json');

router.get('/guilds', (req, res) => {
  try {
    const guilds = readJson(GUILDS_FILE) || {};
    const guildList = Object.values(guilds).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    res.json(guildList);
  } catch (error) {
    console.error('Failed to load guilds:', error);
    res.status(500).json([]);
  }
});

module.exports = router;