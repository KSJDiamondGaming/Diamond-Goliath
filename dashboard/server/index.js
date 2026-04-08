const path = require('path');
const fs = require('fs');

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

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';

console.log('ENV LOADED:', {
  CLIENT_ID: process.env.CLIENT_ID,
  REDIRECT: process.env.DISCORD_REDIRECT_URI,
  CLIENT_URL,
});

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    name: 'ksj_dashboard_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use('/api/auth', authRoute);
app.use('/api/discord', discordRoutes);
app.use('/api/cases', casesRoute);
app.use('/api/warnings', warningsRoute);
app.use('/api/config', configRoute);
app.use('/api/automod', automodRoutes);
app.use('/api/status', statusRoute);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🌐 Dashboard backend running on http://localhost:${PORT}`);
});