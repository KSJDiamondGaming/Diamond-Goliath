const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '..', '..', '.env'),
});

dotenv.config({
  path: path.resolve(__dirname, '..', '.env'),
  override: true,
});

const http = require('http');
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const terminal = require('../../src/utils/utility/terminalLogger').createLogger('api');

const { initSocketHub } = require('./sockets/socketHub');

const authRoute = require('./routes/auth');
const discordRoutes = require('./routes/discord');
const configRoute = require('./routes/guildConfig');
const casesRoute = require('./routes/moderation');
const statusRoute = require('./routes/status');

const app = express();

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const allowedOrigins = new Set([
  CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

if (IS_PROD) {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const url = req.originalUrl;
    const status = res.statusCode;

    if (status >= 400) {
      return terminal.request(req.method, url, status, duration);
    }

  if (
    url.includes('/api/cases') ||
    url.includes('/api/status')
  ) {
    return;
  }

    if (status === 304) return;

    if (duration > 100) {
      return terminal.request(req.method, url, status, duration);
    }
  });

  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    name: 'ksj_dashboard_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use('/api/auth', authRoute);
app.use('/api/discord', discordRoutes);
app.use('/api/cases', casesRoute);       // now includes warnings
app.use('/api/config', configRoute);     // now includes automod
app.use('/api/status', statusRoute);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  terminal.error('API Error', err);

  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error: 'Internal server error',
  });
});

const server = http.createServer(app);

initSocketHub(server, {
  clientUrl: CLIENT_URL,
});

server.listen(PORT, () => {
  terminal.line('🌐 Dashboard', `http://localhost:${PORT}`);
  terminal.line('🖥️ Client', CLIENT_URL);
  terminal.line('📡 Live Sync', 'Socket.IO enabled');
});