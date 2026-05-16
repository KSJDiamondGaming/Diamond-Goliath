const path = require('path');

/**
 * Dashboard API env loading
 *
 * Loads the bot mode env first:
 *   .env.dev
 *   .env.beta
 *   .env.production
 *
 * Then loads dashboard-specific local settings:
 *   .env.dashboard.txt
 *
 * This keeps the dashboard API connected to the correct bot/runtime mode.
 */
const BOT_MODE = String(process.env.BOT_MODE || 'dev').toLowerCase();

require('dotenv').config({
  path: path.resolve(process.cwd(), `.env.${BOT_MODE}`),
});

require('dotenv').config({
  path: path.resolve(process.cwd(), '.env.dashboard.txt'),
  override: true,
});

const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');

const { initSocketHub } = require('../server/sockets/socketHub');

const auth = require('../server/routes/auth');
const discord = require('../server/routes/discord');
const status = require('../server/routes/status');

const automod = require('../server/routes/config/automod');
const logs = require('../server/routes/config/logs');
const messages = require('../server/routes/config/messages');
const embeds = require('../server/routes/config/embeds');

const cases = require('../server/routes/moderation');

const serverRestoreRoutes = require('../server/routes/serverRestoreRoutes');

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));

app.use(express.json());

app.use(session({
  name: 'goliath_dashboard_session',
  secret: process.env.SESSION_SECRET || 'dev-dashboard-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  },
}));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'goliath-dashboard-api',
    mode: BOT_MODE,
    port: PORT,
    clientUrl: CLIENT_URL,
    botApiUrl: process.env.BOT_API_URL || null,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', auth);
app.use('/api/discord', discord);
app.use('/api/status', status);

app.use('/api/config/automod', automod);
app.use('/api/config/logs', logs);
app.use('/api/config/messages', messages);
app.use('/api/config/embeds', embeds);

app.use('/api/cases', cases);

app.use('/api/server-restore', serverRestoreRoutes);

initSocketHub(server, {
  clientUrl: CLIENT_URL,
});

server.listen(PORT, () => {
  console.log('============================================================');
  console.log(`🌐 Goliath Dashboard API running`);
  console.log(`🧠 Mode: ${BOT_MODE.toUpperCase()}`);
  console.log(`🔗 API: http://localhost:${PORT}`);
  console.log(`🖥️ Client: ${CLIENT_URL}`);
  console.log(`🤖 Bot API: ${process.env.BOT_API_URL || 'not set'}`);
  console.log('============================================================');
});