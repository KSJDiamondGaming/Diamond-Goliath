const fetch = global.fetch || require('node-fetch');
const express = require('express');

const router = express.Router();

const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true';

function getAuthConfig() {
  return {
    clientId: String(process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || '').trim(),
    clientSecret: String(
      process.env.DISCORD_CLIENT_SECRET || process.env.CLIENT_SECRET || ''
    ).trim(),
    redirectUri: String(process.env.DISCORD_REDIRECT_URI || '').trim(),
    clientUrl: String(
      process.env.CLIENT_URL || process.env.VITE_CLIENT_URL || 'http://localhost:5173'
    ).trim(),
  };
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };
}

function getDiscordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return null;

  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
}

router.get('/login', (req, res) => {
  const { clientId, clientSecret, redirectUri } = getAuthConfig();

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error:
        'Missing Discord OAuth config. Expected DISCORD_CLIENT_ID or CLIENT_ID, and DISCORD_REDIRECT_URI.',
    });
  }

  if (!clientSecret) {
    return res.status(500).json({
      error:
        'Missing Discord OAuth secret. Expected DISCORD_CLIENT_SECRET or CLIENT_SECRET.',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds',
  });

  const authUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

  if (DEBUG) {
    console.log('[AUTH] OAuth URL:', authUrl);
  }

  return res.redirect(authUrl);
});

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({
      authenticated: false,
      user: null,
    });
  }

  return res.json({
    authenticated: true,
    user: req.session.user,
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('❌ Logout session destroy failed:', error);
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.clearCookie('goliath_dashboard_session', getCookieOptions());

    return res.json({
      success: true,
    });
  });
});

router.get('/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const { clientId, clientSecret, redirectUri, clientUrl } = getAuthConfig();

    if (!code) {
      return res.status(400).send('Missing OAuth code.');
    }

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ OAuth config missing');

      return res.status(500).send(
        'OAuth configuration error. Check DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and DISCORD_REDIRECT_URI.'
      );
    }

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('❌ Discord token error:', tokenData);

      const errorDescription =
        typeof tokenData?.error_description === 'string'
          ? tokenData.error_description
          : '';

      if (errorDescription.toLowerCase().includes('rate limited')) {
        return res.status(429).send('Discord OAuth rate limited. Try again later.');
      }

      return res.status(500).send('OAuth failed.');
    }

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error('❌ Discord user fetch failed:', userData);
      return res.status(500).send('Failed to fetch user.');
    }

    req.session.user = {
      id: userData.id,
      username: userData.username,
      global_name: userData.global_name || null,
      avatar: userData.avatar || null,
      avatarUrl: getDiscordAvatarUrl(userData),
    };

    req.session.accessToken = tokenData.access_token;
    req.session.refreshToken = tokenData.refresh_token || null;
    req.session.tokenType = tokenData.token_type || 'Bearer';

    if (DEBUG) {
      console.log('[AUTH] User logged in:', req.session.user.username);
    }

    req.session.save((saveError) => {
      if (saveError) {
        console.error('❌ Session save failed:', saveError);
        return res.status(500).send('Session error.');
      }

      return res.redirect(`${clientUrl}/`);
    });
  } catch (error) {
    console.error('❌ Auth error:', error);
    return res.status(500).send('Authentication failed.');
  }
});

module.exports = router;
