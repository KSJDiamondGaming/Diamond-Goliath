const fs = require('fs');
const path = require('path');

const { loadEnvironment } = require('./src/config/envLoader');

loadEnvironment();

const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');

const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

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

const { initSocketHub } = require('./src/server/sockets/socketHub');

const authRoutes = require('./src/server/routes/auth');
const discordRoutes = require('./src/server/routes/discord');
const statusRoutes = require('./src/server/routes/status');

const automodRoutes = require('./src/server/routes/config/automod');
const generalSettingsRoutes = require('./src/server/routes/config/generalSettings');
const logsRoutes = require('./src/server/routes/config/logs');
const messagesRoutes = require('./src/server/routes/config/messages');
const embedsRoutes = require('./src/server/routes/config/embeds');

const moderationRoutes = require('./src/server/routes/moderation');
const serverRestoreRoutes = require('./src/server/routes/serverRestoreRoutes');
const securityRoutes = require('./src/server/routes/security');
const ticketRoutes = require('./src/server/routes/tickets');

const {
  restoreLockdownReminders,
} = require('./src/security/lockdownSystem');

const {
  restoreExpiredQuarantines,
} = require('./src/security/quarantineSystem');

/* ---------------- SAFE MODULE LOADS ---------------- */

const backupSchedulerModule = safeLoad(
  'Server Backup Scheduler',
  () => require('./src/security/serverBackupScheduler'),
);

const startServerBackupScheduler =
  backupSchedulerModule.ok &&
  typeof backupSchedulerModule.result?.startServerBackupScheduler === 'function'
    ? backupSchedulerModule.result.startServerBackupScheduler
    : null;

/* ---------------- ENV / MODE ---------------- */

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
const BOT_MODE = selectedMode.toUpperCase();
const activeMode = getBotModeConfig(BOT_MODE);

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_TOKEN) {
  process.env.DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
}

if (!process.env.TOKEN && process.env.DISCORD_TOKEN) {
  process.env.TOKEN = process.env.DISCORD_TOKEN;
}

/* ---------------- CLIENT ---------------- */

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

function getAllowedOrigins() {
  const origins = new Set([
    'https://goliath.ksjdigital.co.uk',
    'http://localhost:5173',
  ]);

  const envOrigins = [
    process.env.CLIENT_URL,
    process.env.DASHBOARD_CLIENT_URL,
    process.env.VITE_CLIENT_URL,
  ];

  for (const origin of envOrigins) {
    if (origin && String(origin).trim()) {
      origins.add(String(origin).trim());
    }
  }

  return [...origins];
}

function getDashboardClientUrl() {
  return String(
    process.env.CLIENT_URL ||
      process.env.DASHBOARD_CLIENT_URL ||
      process.env.VITE_CLIENT_URL ||
      'https://goliath.ksjdigital.co.uk',
  ).trim();
}

function startDashboardApiServer() {
  const app = express();
  const apiServer = http.createServer(app);

  app.locals.client = client;
  app.locals.discordClient = client;

  global.client = client;
  global.discordClient = client;

  const allowedOrigins = getAllowedOrigins();
  const dashboardClientUrl = getDashboardClientUrl();

  app.set('trust proxy', 1);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked origin: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json());

  app.use(
    session({
      name: 'goliath_dashboard_session',
      secret: process.env.SESSION_SECRET || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      },
    }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/discord', discordRoutes);
  app.use('/api/status', statusRoutes);

  app.use('/api/config', generalSettingsRoutes);
  app.use('/api/config/automod', automodRoutes);
  app.use('/api/config/logs', logsRoutes);
  app.use('/api/config/messages', messagesRoutes);
  app.use('/api/config/embeds', embedsRoutes);

  app.use('/api/cases', moderationRoutes);
  app.use('/api/tickets', ticketRoutes);

  app.use('/api/server-restore', serverRestoreRoutes);
  app.use('/api/security', securityRoutes);

  initSocketHub(apiServer, {
    clientUrl: dashboardClientUrl,
  });

  const apiPort = Number(process.env.PORT || process.env.BOT_API_PORT || 3001);

  apiServer.listen(apiPort, () => {
    console.log(`🌐 Dashboard API running on http://localhost:${apiPort}`);
  });

  return apiServer;
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

const registeredEvents = new Set();

function registerEvent(event, file) {
  if (!event?.name || typeof event.execute !== 'function') {
    console.warn(`⚠️ Skipped event in: ${file}`);
    return;
  }

  const eventKey = `${event.name}:${file}`;

  if (registeredEvents.has(eventKey)) {
    console.warn(
      `⚠️ Duplicate event skipped: ${event.name} (${file})`
    );
    return;
  }

  registeredEvents.add(eventKey);

  /*
  ==========================================
  CRITICAL INTERACTION SAFETY
  Prevent duplicate interactionCreate listeners
  ==========================================
  */

  if (event.name === 'interactionCreate') {
    const existing =
      client.listenerCount('interactionCreate');

    if (existing > 0) {
      console.warn(
        `⚠️ Removing ${existing} existing interactionCreate listener(s)`
      );

      client.removeAllListeners('interactionCreate');
    }
  }

  const handler = async (...args) => {
    try {
      await event.execute(...args, client);
    } catch (error) {
      console.error(
        `❌ Event execution failed: ${event.name}`
      );
      console.error(error);
    }
  };

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

function registerProcessSafetyHandlers(apiServer) {
  let shuttingDown = false;

  async function shutdown(reason) {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log(`🛑 ${reason} received. Shutting down Goliath...`);

    if (apiServer) {
      apiServer.close(() => {
        console.log('🌐 Dashboard API stopped.');
      });
    }

    client.destroy();

    process.exit(0);
  }

  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection');
    console.error(reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception');
    console.error(err);
    process.exit(1);
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/* ---------------- START ---------------- */

async function start() {
  printStartupBanner();

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

  const apiServer = startDashboardApiServer();

  registerProcessSafetyHandlers(apiServer);
  registerModeProtectionEvents();

  loadCommands();
  loadEvents();

  console.log(
  '[Debug] interactionCreate listeners:',
  client.listenerCount('interactionCreate')
);

  await client.login(token);
}

start().catch((err) => {
  console.error('❌ Bot startup failed');
  console.error(err);
  process.exit(1);
});

module.exports = client;