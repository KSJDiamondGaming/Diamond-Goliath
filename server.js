const fs = require('fs');
const path = require('path');
const http = require('http');

const express = require('express');
const cors = require('cors');
const session = require('express-session');

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

const { loadEnvironment } = require('./src/config/envLoader');
const { getBotModeConfig } = require('./src/config/botModes');

const {
  enforceGuildAccess,
  enforceCurrentGuilds,
} = require('./src/config/guildAccess');

const {
  bootstrapRuntime,
  runBootValidation,
  safeLoad,
  printStartupFingerprint,
} = require('./src/runtime/runtimeBootstrap');

/* ---------------- SAFE MODULE LOADS ---------------- */

const backupSchedulerModule = safeLoad(
  'Server Backup Scheduler',
  () => require('./src/security/serverBackupScheduler')
);

const startServerBackupScheduler =
  backupSchedulerModule.ok &&
  typeof backupSchedulerModule.result?.startServerBackupScheduler === 'function'
    ? backupSchedulerModule.result.startServerBackupScheduler
    : null;

/* ---------------- MODE / ENV ---------------- */

const ALLOWED_MODES = ['dev', 'beta', 'production'];

function resolveBotMode() {
  const argMode = process.argv[2]?.toLowerCase();
  const envMode = process.env.BOT_MODE?.toLowerCase();

  if (ALLOWED_MODES.includes(argMode)) return argMode;
  if (ALLOWED_MODES.includes(envMode)) return envMode;

  return 'dev';
}

const selectedMode = resolveBotMode();

process.env.BOT_MODE = selectedMode;

const loadedEnv = loadEnvironment(selectedMode);

/**
 * Dashboard-specific env overrides.
 * Example:
 *   .env.dashboard.txt
 *
 * This lets the dashboard API keep local values like:
 *   PORT=3001
 *   CLIENT_URL=http://localhost:5173
 *   SESSION_SECRET=...
 */
require('dotenv').config({
  path: path.resolve(process.cwd(), '.env.dashboard.txt'),
  override: true,
});

const BOT_MODE = selectedMode.toUpperCase();
const activeMode = getBotModeConfig(BOT_MODE);

/* ---------------- DASHBOARD API IMPORTS ---------------- */

const { initSocketHub } = require('./src/server/sockets/socketHub');

const authRoutes = require('./src/server/routes/auth');
const discordRoutes = require('./src/server/routes/discord');
const statusRoutes = require('./src/server/routes/status');

const automodRoutes = require('./src/server/routes/config/automod');
const logsRoutes = require('./src/server/routes/config/logs');
const messagesRoutes = require('./src/server/routes/config/messages');
const embedsRoutes = require('./src/server/routes/config/embeds');

const moderationRoutes = require('./src/server/routes/moderation');
const serverRestoreRoutes = require('./src/server/routes/serverRestoreRoutes');

/* ---------------- DISCORD CLIENT ---------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();
client.botMode = BOT_MODE;
client.modeConfig = activeMode;

/* ---------------- SHARED STATE ---------------- */

let dashboardServer = null;

/* ---------------- HELPERS ---------------- */

function logDev(message) {
  if (activeMode.verboseLogging) {
    console.log(message);
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }

  return value;
}

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...getAllJsFiles(fullPath));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      !entry.name.endsWith('.test.js') &&
      !entry.name.endsWith('.spec.js')
    ) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function printStartupBanner() {
  const modeLabels = {
    DEV: '🟢 GOLIATH DEV',
    BETA: '🟡 GOLIATH BETA',
    PRODUCTION: '🔴 GOLIATH PRODUCTION',
  };

  console.log('============================================================');
  console.log(`🚀 Starting ${modeLabels[BOT_MODE] || 'Goliath'}`);
  console.log(`🧠 Mode: ${BOT_MODE}`);
  console.log(`📄 Env: ${loadedEnv.envFile}`);
  console.log('============================================================');
}

/* ---------------- DASHBOARD API ---------------- */

function startDashboardApi() {
  const app = express();
  const server = http.createServer(app);

  const PORT = Number(process.env.PORT || 3001);
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

  app.use(
    cors({
      origin: CLIENT_URL,
      credentials: true,
    })
  );

  app.use(express.json());

  app.use(
    session({
      name: 'goliath_dashboard_session',
      secret: process.env.SESSION_SECRET || 'dev-dashboard-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      },
    })
  );

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'goliath-dashboard-api',
      mode: selectedMode,
      port: PORT,
      clientUrl: CLIENT_URL,
      botApiUrl: process.env.BOT_API_URL || null,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/discord', discordRoutes);
  app.use('/api/status', statusRoutes);

  app.use('/api/config/automod', automodRoutes);
  app.use('/api/config/logs', logsRoutes);
  app.use('/api/config/messages', messagesRoutes);
  app.use('/api/config/embeds', embedsRoutes);

  app.use('/api/cases', moderationRoutes);
  app.use('/api/server-restore', serverRestoreRoutes);

  initSocketHub(server, {
    clientUrl: CLIENT_URL,
  });

  server.listen(PORT, () => {
    console.log('============================================================');
    console.log('🌐 Goliath Dashboard API running');
    console.log(`🧠 Mode: ${BOT_MODE}`);
    console.log(`🔗 API: http://localhost:${PORT}`);
    console.log(`🖥️ Client: ${CLIENT_URL}`);
    console.log(`🤖 Bot API: ${process.env.BOT_API_URL || 'not set'}`);
    console.log('============================================================');
  });

  return server;
}

/* ---------------- COMMANDS ---------------- */

function loadCommands() {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const files = getAllJsFiles(commandsPath);

  console.log(`📦 Loading commands from: ${commandsPath}`);

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];

      const command = require(file);

      if (!command?.data?.name || typeof command.execute !== 'function') {
        console.warn(`⚠️ Skipped command: ${file}`);
        continue;
      }

      client.commands.set(command.data.name, command);
      console.log(`✅ Command: ${command.data.name}`);
    } catch (err) {
      console.error(`❌ Command failed: ${file}`);
      console.error(err);
    }
  }

  console.log(`✅ Loaded ${client.commands.size} command(s).`);
}

/* ---------------- EVENTS ---------------- */

function registerEvent(event, file) {
  if (!event?.name || typeof event.execute !== 'function') {
    console.warn(`⚠️ Skipped event in: ${file}`);
    return;
  }

  const handler = (...args) => event.execute(...args, client);

  if (event.once) {
    client.once(event.name, handler);
  } else {
    client.on(event.name, handler);
  }

  console.log(`🧩 Event: ${event.name}`);
}

function loadEvents() {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const files = getAllJsFiles(eventsPath);

  console.log(`📦 Loading events from: ${eventsPath}`);

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];

      const loadedEvent = require(file);
      const events = Array.isArray(loadedEvent) ? loadedEvent : [loadedEvent];

      for (const event of events) {
        registerEvent(event, file);
      }
    } catch (err) {
      console.error(`❌ Event failed: ${file}`);
      console.error(err);
    }
  }

  console.log('✅ Event loading complete.');
}

/* ---------------- MODE EVENTS ---------------- */

function registerModeProtectionEvents() {
  client.on('guildCreate', async (guild) => {
    await enforceGuildAccess(guild, BOT_MODE, activeMode);
  });
}

/* ---------------- PROCESS SAFETY ---------------- */

function shutdown(code = 0) {
  console.log('🛑 Shutting down Goliath...');

  try {
    client.destroy();
  } catch (error) {
    console.error('⚠️ Failed to destroy Discord client cleanly:', error);
  }

  if (dashboardServer) {
    dashboardServer.close(() => {
      console.log('🌐 Dashboard API stopped.');
      process.exit(code);
    });

    setTimeout(() => {
      process.exit(code);
    }, 1500);

    return;
  }

  process.exit(code);
}

function registerProcessSafetyHandlers() {
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection');
    console.error(reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception');
    console.error(err);
    shutdown(1);
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received.');
    shutdown(0);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received.');
    shutdown(0);
  });
}

/* ---------------- BOT START ---------------- */

async function startBot() {
  const runtimePaths = bootstrapRuntime(BOT_MODE);

  printStartupFingerprint(BOT_MODE, runtimePaths);

  client.runtimePaths = runtimePaths;

  console.log(`📁 Runtime Root: ${runtimePaths.root}`);
  console.log(`📁 Runtime Mode: ${runtimePaths.mode}`);

  runBootValidation({
    requiredPaths: [
      {
        path: './src/commands',
        label: 'Commands Folder',
      },
      {
        path: './src/events',
        label: 'Events Folder',
      },
      {
        path: './src/security',
        label: 'Security Folder',
      },
    ],

    requiredEnv: ['DISCORD_TOKEN'],
  });

  const token = getRequiredEnv('DISCORD_TOKEN');

  if (BOT_MODE === 'DEV') {
    getRequiredEnv('DEV_GUILD_ID');
  }

  if (BOT_MODE === 'BETA') {
    getRequiredEnv('BETA_GUILD_IDS');
  }

  registerModeProtectionEvents();

  loadCommands();
  loadEvents();

  client.once('clientReady', async (readyClient) => {
    console.log(`🤖 Logged in as ${readyClient.user.tag}`);
    console.log(`🧠 Active mode: ${BOT_MODE}`);

    await enforceCurrentGuilds(client, BOT_MODE, activeMode);

    if (activeMode.startBackupScheduler) {
      if (startServerBackupScheduler) {
        console.log('💾 Starting server backup scheduler...');
        startServerBackupScheduler(readyClient);
      } else {
        console.warn('⚠️ Backup scheduler unavailable. Continuing startup safely.');
      }
    } else {
      logDev('💾 Backup scheduler disabled in DEV mode.');
    }

    console.log('✅ Goliath bot startup complete.');
  });

  await client.login(token);
}

/* ---------------- START ALL ---------------- */

async function start() {
  printStartupBanner();

  registerProcessSafetyHandlers();

  dashboardServer = startDashboardApi();

  await startBot();

  console.log('✅ Goliath core startup complete.');
}

start().catch((err) => {
  console.error('❌ Goliath startup failed');
  console.error(err);
  shutdown(1);
});

module.exports = {
  client,
  get dashboardServer() {
    return dashboardServer;
  },
};