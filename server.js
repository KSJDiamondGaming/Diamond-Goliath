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

const { enforceGuildAccess } = require('./src/config/guildAccess');

const {
  bootstrapRuntime,
  runBootValidation,
  safeLoad,
  printStartupFingerprint,
} = require('./src/core/runtime/runtimeBootstrap');

const { initSocketHub } = require('./src/server/sockets/socketHub');

/* ---------------- ROUTES ---------------- */

const authRoutes = require('./src/server/routes/auth');
const discordResourceRoutes = require('./src/server/routes/discordResources');
const discordRoutes = require('./src/server/routes/discord');
const statusRoutes = require('./src/server/routes/status');
const ownerRoutes = require('./src/server/routes/owner');
const ownerTranslationRoutes = require('./src/server/routes/ownerTranslation');

const automodRoutes = require('./src/server/routes/config/automod');
const generalSettingsRoutes = require('./src/server/routes/config/generalSettings');
const logsRoutes = require('./src/server/routes/config/logs');
const messagesRoutes = require('./src/server/routes/config/messages');
const embedsRoutes = require('./src/server/routes/config/embeds');

const billingRoutes = require('./src/server/routes/billing');
const moderationRoutes = require('./src/server/routes/moderation');
const serverRestoreRoutes = require('./src/server/routes/serverRestoreRoutes');
const securityRoutes = require('./src/server/routes/security');
const ticketRoutes = require('./src/server/routes/tickets');
const formsRoutes = require('./src/server/routes/forms');
const transcriptRoutes = require('./src/server/routes/transcripts');
const translationRoutes = require('./src/server/routes/translation');
const permissionHealthRoutes = require('./src/server/routes/permissionHealth');
const socialRoutes = require('./src/server/routes/social');
const modulesRoutes = require('./src/server/routes/modules');

/* ---------------- SAFE MODULE LOADS ---------------- */

const backupSchedulerModule = safeLoad(
  'Server Backup Scheduler',
  () => require('./src/core/security/serverBackupScheduler'),
);

const startServerBackupScheduler =
  backupSchedulerModule.ok &&
  typeof backupSchedulerModule.result?.startServerBackupScheduler === 'function'
    ? backupSchedulerModule.result.startServerBackupScheduler
    : null;

const socialSchedulerModule = safeLoad(
  'Social Scheduler',
  () => require('./src/modules/social/socialScheduler'),
);

const startSocialScheduler =
  socialSchedulerModule.ok &&
  typeof socialSchedulerModule.result?.startSocialScheduler === 'function'
    ? socialSchedulerModule.result.startSocialScheduler
    : null;

const subscriptionWorkerModule = safeLoad(
  'Subscription Worker',
  () => require('./src/server/billing/subscriptionWorker'),
);

const startSubscriptionWorker =
  subscriptionWorkerModule.ok &&
  typeof subscriptionWorkerModule.result?.startSubscriptionWorker === 'function'
    ? subscriptionWorkerModule.result.startSubscriptionWorker
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

/* ---------------- GLOBAL SOCKET BRIDGE ---------------- */

let io = null;

/**
 * REAL-TIME SYNC ENGINE
 * Discord ↔ Backend ↔ Dashboard
 */
function emitSyncEvent(event, payload = {}) {
  if (!io) return;

  io.emit(event, {
    ...payload,
    timestamp: Date.now(),
  });
}

/* ---------------- HELPERS ---------------- */

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    console.error(`❌ Missing required env: ${name}`);
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

    if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

/* ---------------- DASHBOARD API ---------------- */

function startDashboardApiServer() {
  const app = express();
  const server = http.createServer(app);

  app.locals.client = client;
  global.client = client;

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
  }));

  /* ROUTES */
  app.use('/api/auth', authRoutes);
  app.use('/api/discord', discordRoutes);
  app.use('/api/status', statusRoutes);
  app.use('/api/owner', ownerRoutes);

  app.use('/api/config/embeds', embedsRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/forms', formsRoutes);
  app.use('/api/cases', moderationRoutes);
  app.use('/api/security', securityRoutes);

  /* SOCKET HUB */
  const socketHub = initSocketHub(server, {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  });

  io = socketHub.io || socketHub;
  global.io = io;

  server.listen(process.env.PORT || 3001, () => {
    console.log('🌐 API running on port 3001');
  });

  return server;
}

/* ---------------- COMMANDS ---------------- */

function loadCommands() {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const files = getAllJsFiles(commandsPath);

  for (const file of files) {
    try {
      delete require.cache[require.resolve(file)];
      const command = require(file);

      if (command?.data?.name && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
      }
    } catch (err) {
      console.error(`❌ Command load failed: ${file}`);
      console.error(err);
    }
  }

  console.log(`📦 Loaded ${client.commands.size} commands`);
}

/* ---------------- EVENTS ---------------- */

function registerEvent(event) {
  client.on(event.name, async (...args) => {
    try {
      await event.execute(...args);
    } catch (err) {
      console.error(`❌ Event error: ${event.name}`, err);
    }
  });
}

/* ---------------- STARTUP ---------------- */

async function start() {
  console.log(`🚀 Starting Goliath (${BOT_MODE})`);

  bootstrapRuntime({ mode: selectedMode });
  runBootValidation({ mode: selectedMode });

  printStartupFingerprint({ mode: BOT_MODE });

  getRequiredEnv('DISCORD_BOT_TOKEN');

  loadCommands();

  const eventsPath = path.join(process.cwd(), 'src', 'events');

  for (const file of getAllJsFiles(eventsPath)) {
    const loaded = require(file);
    const events = Array.isArray(loaded) ? loaded : [loaded];

    events.forEach(registerEvent);
  }

  startDashboardApiServer();

  if (startServerBackupScheduler) startServerBackupScheduler(client);
  if (startSocialScheduler) startSocialScheduler(client);
  if (startSubscriptionWorker) startSubscriptionWorker(client);

  await client.login(process.env.DISCORD_BOT_TOKEN);
}

start().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

/* ---------------- EXPORT ---------------- */

module.exports = {
  emitSyncEvent,
};