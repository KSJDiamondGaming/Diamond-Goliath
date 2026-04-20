require('dotenv').config();

const terminal = require('./src/utils/utility/terminalLogger');

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} = require('discord.js');

/* ---------------- PROCESS SAFETY ---------------- */

process.on('unhandledRejection', (reason) => {
  terminal.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  terminal.error('Uncaught exception', error);
});

process.on('uncaughtExceptionMonitor', (error) => {
  terminal.error('Uncaught exception monitor', error);
});

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
client.isBooting = true;

/* ---------------- FILE LOADERS ---------------- */

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
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

/* ---------------- COMMAND LOADER ---------------- */

function loadCommands(clientInstance) {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const commandFiles = getAllJsFiles(commandsPath);

  let loaded = 0;

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (!command?.data || typeof command.execute !== 'function') {
        terminal.warn(`Skipping invalid command module: ${filePath}`);
        continue;
      }

      if (clientInstance.commands.has(command.data.name)) {
        terminal.warn(`Duplicate command detected: ${command.data.name} (${filePath})`);
        continue;
      }

      clientInstance.commands.set(command.data.name, command);
      loaded++;

      terminal.line('✅ Command Loaded', `${command.data.name} -> ${filePath}`);
    } catch (error) {
      terminal.error(`Failed to load command file: ${filePath}`, error);
    }
  }

  return {
    found: commandFiles.length,
    loaded,
  };
}

/* ---------------- EVENT LOADER ---------------- */

function loadEvents(clientInstance) {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const eventFiles = getAllJsFiles(eventsPath);

  let loaded = 0;
  const seenEventFiles = new Set();
  const seenEventBindings = new Set();

  for (const filePath of eventFiles) {
    try {
      const normalizedPath = path.normalize(filePath).toLowerCase();

      if (seenEventFiles.has(normalizedPath)) {
        terminal.warn(`Skipping duplicate event file path: ${filePath}`);
        continue;
      }

      seenEventFiles.add(normalizedPath);

      delete require.cache[require.resolve(filePath)];
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
  };
}

/* ---------------- START BOT ---------------- */

async function startBot() {
  try {
    terminal.start();

    const commandStats = loadCommands(client);
    const eventStats = loadEvents(client);

    const token = process.env.TOKEN;
    if (!token) {
      throw new Error('Missing TOKEN in .env file');
    }

    client.once('clientReady', () => {
      client.isBooting = false;

      terminal.line(
        '🤖 Bot',
        `READY (${commandStats.loaded} cmds, ${eventStats.loaded} events)`
      );

      terminal.line(
        '🔁 interactionCreate listeners',
        String(client.listeners('interactionCreate').length)
      );

      if (client.listeners('interactionCreate').length > 1) {
        terminal.warn('⚠️ Multiple interactionCreate listeners detected!');
      }
    });

    await client.login(token);
  } catch (error) {
    terminal.error('Fatal startup error', error);
  }
}

startBot();

module.exports = client;