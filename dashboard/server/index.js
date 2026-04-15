const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const express = require('express');
const cors = require('cors');
const session = require('express-session');

const terminal = require('../../src/utils/utility/terminalLogger').createLogger('api');

const casesRoute = require('./routes/cases');
const warningsRoute = require('./routes/warnings');
const configRoute = require('./routes/config');
const authRoute = require('./routes/auth');
const discordRoutes = require('./routes/discord');
const automodRoutes = require('./routes/automod');
const statusRoute = require('./routes/status');

const app = express();

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

if (IS_PROD) {
  app.set('trust proxy', 1);
}

/* =========================
   🔥 SMART REQUEST LOGGER
   ========================= */
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    const url = req.originalUrl;
    const status = res.statusCode;

    // ✅ ALWAYS log errors
    if (status >= 400) {
      return terminal.request(req.method, url, status, duration);
    }

    // ❌ Ignore polling routes
    if (
      url.includes('/api/cases') ||
      url.includes('/api/warnings') ||
      url.includes('/api/status')
    ) {
      return;
    }

    // ❌ Ignore cache hits
    if (status === 304) return;

    // ✅ Only log slow requests (>100ms)
    if (duration > 100) {
      return terminal.request(req.method, url, status, duration);
    }
  });

  next();
});

/* =========================
   Middleware
   ========================= */
app.use(
  cors({
    origin: CLIENT_URL,
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
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

/* =========================
   Routes
   ========================= */
app.use('/api/auth', authRoute);
app.use('/api/discord', discordRoutes);
app.use('/api/cases', casesRoute);
app.use('/api/warnings', warningsRoute);
app.use('/api/config', configRoute);
app.use('/api/automod', automodRoutes);
app.use('/api/status', statusRoute);

/* =========================
   404
   ========================= */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

/* =========================
   Errors
   ========================= */
app.use((err, req, res, next) => {
  terminal.error('API Error', err);

  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error: 'Internal server error',
  });
});

/* =========================
   Start
   ========================= */
app.listen(PORT, () => {
  terminal.line('🌐 Dashboard', `http://localhost:${PORT}`);
});