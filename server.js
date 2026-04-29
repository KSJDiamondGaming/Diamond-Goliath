require('dotenv').config();

const fs = require('fs');
const path = require('path');
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
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

/* ---------------- HELPERS ---------------- */

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...getAllJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }

  return results;
}

/* ---------------- COMMANDS ---------------- */

function loadCommands() {
  const commandsPath = path.join(__dirname, 'src', 'commands');
  const files = getAllJsFiles(commandsPath);

  for (const file of files) {
    try {
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
}

/* ---------------- EVENTS ---------------- */

function loadEvents() {
  const eventsPath = path.join(__dirname, 'src', 'events');
  const files = getAllJsFiles(eventsPath);

  for (const file of files) {
    try {
      const event = require(file);

      if (!event?.name || typeof event.execute !== 'function') {
        console.warn(`⚠️ Skipped event: ${file}`);
        continue;
      }

      const handler = (...args) => event.execute(...args, client);

      if (event.once) {
        client.once(event.name, handler);
      } else {
        client.on(event.name, handler);
      }

      console.log(`🧩 Event: ${event.name}`);
    } catch (err) {
      console.error(`❌ Event failed: ${file}`);
      console.error(err);
    }
  }
}

/* ---------------- START ---------------- */

async function start() {
  const token = process.env.TOKEN;

  if (!token) {
    console.error('❌ Missing TOKEN in .env');
    process.exit(1);
  }

  loadCommands();
  loadEvents();

  client.once('clientReady', (readyClient) => {
    console.log(`🤖 Logged in as ${readyClient.user.tag}`);
  });

  await client.login(token);
}

start().catch((err) => {
  console.error('❌ Bot startup failed');
  console.error(err);
  process.exit(1);
});

module.exports = client;