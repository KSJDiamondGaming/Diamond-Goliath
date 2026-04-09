const express = require('express');
const router = express.Router();

router.get('/guilds', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.session.access_token) {
      return res.status(401).json({ error: 'Missing access token' });
    }

    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${req.session.access_token}`,
      },
    });

    const guilds = await response.json();

    if (!response.ok) {
      console.error('Discord guild fetch error:', guilds);
      return res.status(500).json({ error: 'Failed to fetch guilds' });
    }

    // Optional: filter only servers where user has MANAGE_GUILD
    const filtered = guilds.filter(
      (g) => (g.permissions & 0x20) === 0x20 // MANAGE_GUILD
    );

    res.json(filtered);
  } catch (err) {
    console.error('Guild fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;