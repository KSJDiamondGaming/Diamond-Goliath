const express = require('express');
console.log('✅ AUTH ROUTES FILE LOADED');

const router = express.Router();

const CLIENT_ID = String(process.env.CLIENT_ID || '').trim();
const CLIENT_SECRET = String(process.env.CLIENT_SECRET || '').trim();
const REDIRECT_URI = String(process.env.DISCORD_REDIRECT_URI || '').trim();
const CLIENT_URL = String(process.env.CLIENT_URL || 'http://localhost:5173').trim();

router.get('/login', (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).json({
      error: 'Missing CLIENT_ID or DISCORD_REDIRECT_URI in dashboard/.env',
    });
  }

  console.log('OAuth client_id:', JSON.stringify(CLIENT_ID));
  console.log('OAuth redirect_uri:', JSON.stringify(REDIRECT_URI));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: 'identify guilds',
  });

  const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
  console.log('OAuth URL:', authUrl);

  return res.redirect(authUrl);
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: req.session.user,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('ksj_dashboard_session');
    return res.json({ success: true });
  });
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send('Missing OAuth code.');
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Discord token error:', tokenData);
      return res.status(500).send('Failed to get Discord token.');
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('Discord user fetch error:', userData);
      return res.status(500).send('Failed to get Discord user.');
    }

    req.session.user = {
      id: userData.id,
      username: userData.username,
      global_name: userData.global_name || null,
      avatar: userData.avatar || null,
    };

    return res.redirect(`${CLIENT_URL}/dashboard`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return res.status(500).send('Authentication failed.');
  }
});

module.exports = router;