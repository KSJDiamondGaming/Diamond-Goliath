require('dotenv').config();

const terminal = require('./src/core/logs/terminalLogger');
const { syncCommands } = require('./src/bot/loaders/syncCommands');

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
  ],
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.isBooting = true;
client.startTimestamp = Date.now();
client.bootId = `${process.pid}-${Date.now()}`;

/* ---------------- PROCESS SAFETY ---------------- */

let isShuttingDown = false;

process.on('unhandledRejection', (reason) => {
  terminal.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  terminal.error('Uncaught exception', error);
});

process.on('uncaughtExceptionMonitor', (error) => {
  terminal.error('Uncaught exception monitor', error);
});

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    terminal.warn(`Received ${signal}. Shutting down gracefully...`);

    client.isBooting = true;

    if (client.isReady()) {
      client.removeAllListeners();
      client.destroy();
    }

    terminal.line('🛑 Bot', 'Shutdown complete');
  } catch (error) {
    terminal.error('Error during shutdown', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* ---------------- FILE HELPERS ---------------- */

function getAllJsFiles(dir) {
  let results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
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

function clearRequireCache(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
  } catch {
    terminal.warn(`Could not clear require cache for: ${filePath}`);
  }
}

function normalizeFilePath(filePath) {
  return path.normalize(filePath).toLowerCase();
}

/* ---------------- COMMAND LOADER ---------------- */

function loadCommands(clientInstance) {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getAllJsFiles(commandsPath);

  let loaded = 0;
  const seenCommandFiles = new Set();
  const duplicateNames = new Set();

  clientInstance.commands.clear();

  for (const filePath of commandFiles) {
    try {
      const normalizedPath = normalizeFilePath(filePath);

      if (seenCommandFiles.has(normalizedPath)) {
        terminal.warn(`Skipping duplicate command file path: ${filePath}`);
        continue;
      }

      seenCommandFiles.add(normalizedPath);

      clearRequireCache(filePath);
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
        terminal.warn(`Skipping invalid command module: ${filePath}`);
        continue;
      }

      const commandName = command.data.name;

      if (!commandName || typeof commandName !== 'string') {
        terminal.warn(`Skipping command with invalid name: ${filePath}`);
        continue;
      }

      if (clientInstance.commands.has(commandName)) {
        duplicateNames.add(commandName);
        terminal.warn(`Duplicate command detected: ${commandName} (${filePath})`);
        continue;
      }

      clientInstance.commands.set(commandName, command);
      loaded++;

      terminal.line('✅ Command Loaded', `${commandName} -> ${filePath}`);
    } catch (error) {
      terminal.error(`Failed to load command file: ${filePath}`, error);
    }
  }

  if (duplicateNames.size > 0) {
    terminal.warn(
      `Duplicate command names skipped: ${[...duplicateNames].join(', ')}`
    );
  }

  return {
    found: commandFiles.length,
    loaded,
    skipped: commandFiles.length - loaded,
  };
}

/* ---------------- EVENT LOADER ---------------- */

function loadEvents(clientInstance) {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const eventFiles = getAllJsFiles(eventsPath);

  let loaded = 0;
  const seenEventFiles = new Set();
  const seenEventBindings = new Set();

  for (const eventName of clientInstance.eventNames()) {
    clientInstance.removeAllListeners(eventName);
  }

  for (const filePath of eventFiles) {
    try {
      const normalizedPath = normalizeFilePath(filePath);

      if (seenEventFiles.has(normalizedPath)) {
        terminal.warn(`Skipping duplicate event file path: ${filePath}`);
        continue;
      }

      seenEventFiles.add(normalizedPath);

      clearRequireCache(filePath);
      const event = require(filePath);

      if (!event?.name || typeof event.execute !== 'function') {
        terminal.warn(`Skipping invalid event module: ${filePath}`);
        continue;
      }

      const bindingKey = `${event.name}:${event.once ? 'once' : 'on'}`;

      if (seenEventBindings.has(bindingKey)) {
        terminal.warn(`Skipping duplicate event binding: ${event.name} (${filePath})`);
        continue;
      }

      seenEventBindings.add(bindingKey);

      const handler = async (...args) => {
        try {
          await event.execute(...args);
        } catch (error) {
          terminal.error(`Event handler failed: ${event.name}`, error);
        }
      };

      if (event.once) {
        clientInstance.once(event.name, handler);
      } else {
        clientInstance.on(event.name, handler);
      }

      loaded++;

      terminal.line(
        '🧩 Event Bound',
        `${event.name} -> listeners: ${clientInstance.listeners(event.name).length}`
      );
    } catch (error) {
      terminal.error(`Failed to load event file: ${filePath}`, error);
    }
  }

  return {
    found: eventFiles.length,
    loaded,
    skipped: eventFiles.length - loaded,
  };
}

/* ---------------- COMMAND SYNC ---------------- */

async function maybeSyncCommands() {
  const shouldSync = String(process.env.AUTO_SYNC_COMMANDS).toLowerCase() === 'true';

  if (!shouldSync) {
    terminal.line('🛰️ Command Sync', 'Skipped (AUTO_SYNC_COMMANDS=false)');
    return;
  }

  terminal.line('🛰️ Command Sync', 'Starting automatic sync...');
  await syncCommands();
  terminal.line('🛰️ Command Sync', 'Finished automatic sync');
}

/* ---------------- START BOT ---------------- */

async function startBot() {
  try {
    terminal.start();

    const token = process.env.TOKEN;
    if (!token) {
      throw new Error('Missing TOKEN in .env file');
    }

    const commandStats = loadCommands(client);
    const eventStats = loadEvents(client);

    terminal.line(
      '📦 Commands',
      `Found: ${commandStats.found} | Loaded: ${commandStats.loaded} | Skipped: ${commandStats.skipped}`
    );

    terminal.line(
      '📦 Events',
      `Found: ${eventStats.found} | Loaded: ${eventStats.loaded} | Skipped: ${eventStats.skipped}`
    );

    await maybeSyncCommands();

    client.once('clientReady', (readyClient) => {
      readyClient.isBooting = false;

      terminal.line(
        '🤖 Bot',
        `READY as ${readyClient.user.tag} (${commandStats.loaded} cmds, ${eventStats.loaded} events)`
      );

      terminal.line('🆔 Boot ID', readyClient.bootId);
      terminal.line('🧠 Process ID', String(process.pid));

      terminal.line(
        '🔁 interactionCreate listeners',
        String(readyClient.listeners('interactionCreate').length)
      );

      if (readyClient.listeners('interactionCreate').length > 1) {
        terminal.warn('⚠️ Multiple interactionCreate listeners detected!');
      }

      terminal.line(
        '⏱️ Startup',
        `${Date.now() - readyClient.startTimestamp}ms`
      );
    });

    await client.login(token);
  } catch (error) {
    terminal.error('Fatal startup error', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startBot();
}

module.exports = client;