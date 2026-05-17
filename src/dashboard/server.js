require('dotenv').config();

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

app.use(cors({
  origin: ['https://goliath.ksjdigital.co.uk', 'http://localhost:5173'],
  credentials: true,
}));

app.use(express.json());

app.use(session({
  name: 'goliath_dashboard_session',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  },
}));

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
  clientUrl: 'https://goliath.ksjdigital.co.uk',
});

server.listen(3001, () => {
  console.log('🌐 API running on http://localhost:3001');
});