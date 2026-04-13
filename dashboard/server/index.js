const path = require('path');

// ✅ Load ROOT dashboard/.env
require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
});

const express = require('express');
const cors = require('cors');
const session = require('express-session');

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

console.log('ENV LOADED:', {
  CLIENT_ID: process.env.CLIENT_ID || 'missing',
  REDIRECT: process.env.DISCORD_REDIRECT_URI || 'missing',
  CLIENT_URL,
  PORT,
  NODE_ENV,
});

// Trust proxy only in production if behind reverse proxy
if (IS_PROD) {
  app.set('trust proxy', 1);
}

// --------------------
// Core middleware
// --------------------
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
      secure: IS_PROD, // false locally, true on HTTPS production
      sameSite: IS_PROD ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// --------------------
// Debug / health routes
// --------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Dashboard backend is running',
    port: PORT,
    clientUrl: CLIENT_URL,
    env: NODE_ENV,
  });
});

app.get('/api/session', (req, res) => {
  res.json({
    authenticated: !!req.session?.access_token,
    hasAccessToken: !!req.session?.access_token,
    hasRefreshToken: !!req.session?.refresh_token,
    user: req.session?.user || null,
  });
});

// --------------------
// API routes
// --------------------
app.use('/api/auth', authRoute);
app.use('/api/discord', discordRoutes);
app.use('/api/cases', casesRoute);
app.use('/api/warnings', warningsRoute);
app.use('/api/config', configRoute);
app.use('/api/automod', automodRoutes);
app.use('/api/status', statusRoute);

// --------------------
// 404 handler
// --------------------
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// --------------------
// Global error handler
// --------------------
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: IS_PROD ? 'Something went wrong.' : err.message,
  });
});

// --------------------
// Start server
// --------------------
process.on('exit', (code) => {
  console.log('🛑 Process exit event fired with code:', code);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received');
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received');
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

const server = app.listen(PORT, () => {
  console.log(`🌐 Dashboard backend running on http://localhost:${PORT}`);
  console.log(`🎯 Allowed client origin: ${CLIENT_URL}`);
});

server.on('close', () => {
  console.log('🛑 Express server was closed');
});