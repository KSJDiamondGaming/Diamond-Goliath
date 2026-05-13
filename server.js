const fs = require('fs');
const path = require('path');
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
const { ensureRuntimePaths } = require('./src/config/runtimePaths');

const { startServerBackupScheduler } = require('./src/security/serverBackupScheduler');

/* ---------------- ENV / MODE ---------------- */

const allowedModes = ['dev', 'beta', 'production'];
const modeArg = process.argv[2]?.toLowerCase();

const selectedMode = allowedModes.includes(modeArg)
  ? modeArg
  : 'dev';

process.env.BOT_MODE = selectedMode;

const loadedEnv = loadEnvironment(selectedMode);
const BOT_MODE = selectedMode.toUpperCase();
const activeMode = getBotModeConfig(BOT_MODE);

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

function registerProcessSafetyHandlers() {
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection');
    console.error(reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception');
    console.error(err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received. Shutting down Goliath...');
    client.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received. Shutting down Goliath...');
    client.destroy();
    process.exit(0);
  });
}

/* ---------------- START ---------------- */

async function start() {
  console.log('============================================================');
  console.log('🚀 Starting KSJ Goliath');
  console.log(`🧠 Mode: ${BOT_MODE}`);
  console.log(`📄 Env: ${loadedEnv.envFile}`);
  console.log('============================================================');

  const runtimePaths = ensureRuntimePaths(BOT_MODE);
  client.runtimePaths = runtimePaths;

  console.log(`📁 Runtime: ${runtimePaths.root}`);

  const token = getRequiredEnv('DISCORD_TOKEN');

  if (BOT_MODE === 'DEV') {
    getRequiredEnv('DEV_GUILD_ID');
  }

  if (BOT_MODE === 'BETA') {
    getRequiredEnv('BETA_GUILD_IDS');
  }

  registerProcessSafetyHandlers();
  registerModeProtectionEvents();

  loadCommands();
  loadEvents();

  client.once('clientReady', async (readyClient) => {
    console.log(`🤖 Logged in as ${readyClient.user.tag}`);
    console.log(`🧠 Active mode: ${BOT_MODE}`);

    await enforceCurrentGuilds(client, BOT_MODE, activeMode);

    if (activeMode.startBackupScheduler) {
      console.log('💾 Starting server backup scheduler...');
      startServerBackupScheduler(readyClient);
    } else {
      logDev('💾 Backup scheduler disabled in DEV mode.');
    }

    console.log('✅ Goliath startup complete.');
  });

  await client.login(token);
}

start().catch((err) => {
  console.error('❌ Bot startup failed');
  console.error(err);
  process.exit(1);
});

module.exports = client;